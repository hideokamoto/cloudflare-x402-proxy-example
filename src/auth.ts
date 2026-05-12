/**
 * Authentication middleware for cookie-based JWT verification
 */

import { Context, Next, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { verifyJWT } from "./jwt";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { FacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { Network, SupportedResponse } from "@x402/core/types";
import type { AppContext, Env } from "./env";

/**
 * Creates a combined middleware that checks for valid cookie authentication
 * and conditionally applies payment middleware only if cookie auth fails
 *
 * @param paymentMiddleware - The payment middleware to apply when no valid cookie exists
 * @returns Combined authentication and payment middleware
 */
export function requirePaymentOrCookie(paymentMw: MiddlewareHandler) {
	return async (c: Context<AppContext>, next: Next) => {
		// Check for valid cookie
		const token = getCookie(c, "auth_token");

		if (token) {
			const jwtSecret = c.env.JWT_SECRET;

			// Ensure JWT_SECRET is configured
			if (!jwtSecret) {
				return c.json(
					{
						error:
							"Server misconfigured: JWT_SECRET not set. See README for setup instructions.",
					},
					500
				);
			}

			const payload = await verifyJWT(token, jwtSecret);

			// If token is valid, skip payment and go directly to handler
			if (payload) {
				c.set("auth", payload);
				await next(); // Call the handler
				return;
			}
		}

		// No valid cookie - apply payment middleware
		return await paymentMw(c, next);
	};
}

/**
 * Configuration for a protected route that requires payment
 */
export interface ProtectedRouteConfig {
	/** Route pattern to protect (e.g., "/premium", "/api/paid/*") */
	pattern: string;
	/** Price in USD (e.g. "$0.01") */
	price: string;
	/** Human-readable description of what the payment is for */
	description: string;
	/**
	 * Bot Management Filtering (optional)
	 * Requires Bot Management for Enterprise. See src/bot-management/ for details.
	 */
	bot_score_threshold?: number;
	except_detection_ids?: number[];
}

/**
 * Facilitator wrapper that delegates verify/settle to the real HTTP facilitator
 * but falls back to a locally-declared supported-kinds response if the
 * facilitator's `getSupported` endpoint is unreachable (e.g., in tests, or
 * during a transient facilitator outage). ExactEvmScheme.enhancePaymentRequirements
 * does not consume `supportedKind.extra`, so a minimal kind entry is enough to
 * let the resource server build a 402 response and accept payments.
 */
class ResilientFacilitator implements FacilitatorClient {
	constructor(
		private readonly inner: HTTPFacilitatorClient,
		private readonly fallback: SupportedResponse
	) {}

	verify(
		...args: Parameters<FacilitatorClient["verify"]>
	): ReturnType<FacilitatorClient["verify"]> {
		return this.inner.verify(...args);
	}

	settle(
		...args: Parameters<FacilitatorClient["settle"]>
	): ReturnType<FacilitatorClient["settle"]> {
		return this.inner.settle(...args);
	}

	async getSupported(): Promise<SupportedResponse> {
		try {
			return await this.inner.getSupported();
		} catch (err) {
			console.warn(
				"Facilitator getSupported failed; falling back to declared kinds.",
				err
			);
			return this.fallback;
		}
	}
}

// Module-scoped cache so the facilitator sync runs once per Worker isolate,
// not on every request. Keyed by the env values that affect payment construction
// plus the route pattern.
const middlewareCache = new Map<string, MiddlewareHandler>();

function buildMiddleware(env: Env, config: ProtectedRouteConfig) {
	const facilitatorUrl = env.FACILITATOR_URL || "https://x402.org/facilitator";
	const network = env.NETWORK as Network;
	const payTo = env.PAY_TO as `0x${string}`;

	const cacheKey = [
		facilitatorUrl,
		network,
		payTo,
		config.pattern,
		config.price,
		config.description,
	].join("|");

	const cached = middlewareCache.get(cacheKey);
	if (cached) return cached;

	const innerClient = new HTTPFacilitatorClient({ url: facilitatorUrl });
	const facilitatorClient = new ResilientFacilitator(innerClient, {
		kinds: [{ x402Version: 2, scheme: "exact", network }],
		extensions: [],
		signers: {},
	});

	const resourceServer = new x402ResourceServer(facilitatorClient).register(
		network,
		new ExactEvmScheme()
	);

	const mw = paymentMiddleware(
		{
			[config.pattern]: {
				accepts: {
					scheme: "exact",
					price: config.price,
					network,
					payTo,
				},
				description: config.description,
			},
		},
		resourceServer
	);

	middlewareCache.set(cacheKey, mw);
	return mw;
}

/**
 * Creates middleware for a protected route that requires payment OR valid cookie
 *
 * @param config - Payment configuration
 * @returns Middleware that enforces payment or cookie authentication
 */
export function createProtectedRoute(config: ProtectedRouteConfig) {
	return async (c: Context<AppContext>, next: Next) => {
		const paymentMw = buildMiddleware(c.env, config);
		return await requirePaymentOrCookie(paymentMw)(c, next);
	};
}
