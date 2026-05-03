import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://example.com";

describe("x402-proxy Worker", () => {
	it("GET /__x402/health returns 200 and status ok", async () => {
		const res = await SELF.fetch(`${ORIGIN}/__x402/health`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string; proxy?: string };
		expect(body.status).toBe("ok");
		expect(body.proxy).toBe("x402-proxy");
	});

	it("GET /__x402/config returns 200 with expected shape", async () => {
		const res = await SELF.fetch(`${ORIGIN}/__x402/config`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			network: string;
			protectedPatterns: Array<{ pattern: string }>;
			botManagementFiltering: boolean;
		};
		expect(body.network).toBe("base-sepolia");
		expect(Array.isArray(body.protectedPatterns)).toBe(true);
		expect(
			body.protectedPatterns.some(({ pattern }) => pattern === "/premium/*")
		).toBe(true);
		expect(typeof body.botManagementFiltering).toBe("boolean");
	});

	it("GET /__x402/protected without payment returns 402", async () => {
		const res = await SELF.fetch(`${ORIGIN}/__x402/protected`);
		expect(res.status).toBe(402);
	});

	it("GET /premium/segment without payment returns 402", async () => {
		const res = await SELF.fetch(`${ORIGIN}/premium/segment`);
		expect(res.status).toBe(402);
	});

	it("GET / serves static asset from public/", async () => {
		const res = await SELF.fetch(`${ORIGIN}/`);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html.toLowerCase()).toContain("<!doctype html>");
		expect(html).toContain("x402 Payment-Gated Proxy");
	});
});
