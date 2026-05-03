/**
 * Environment bindings type definition
 *
 * Base shape comes from `wrangler types` (Cloudflare.Env). Optional bindings are
 * listed here when they may be absent from wrangler.jsonc.
 */

import type { JWTPayload } from "./jwt";

export interface Env extends Cloudflare.Env {
	/**
	 * Optional origin URL for External Origin mode.
	 * When set, requests are rewritten to this URL instead of using DNS-based routing.
	 */
	ORIGIN_URL?: string;
	/** Optional: Service Binding to origin Worker */
	ORIGIN_SERVICE?: Fetcher;
}

/** Full app context type for Hono */
export interface AppContext {
	Bindings: Env;
	Variables: {
		auth?: JWTPayload;
	};
}
