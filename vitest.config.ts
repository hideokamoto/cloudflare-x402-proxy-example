import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

/** CI-safe default; override with JWT_SECRET_TEST if needed */
const TEST_JWT_SECRET =
	process.env.JWT_SECRET_TEST ??
	"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

export default defineWorkersProject({
	test: {
		pool: "@cloudflare/vitest-pool-workers",
		poolOptions: {
			workers: {
				singleWorker: true,
				wrangler: { configPath: "./wrangler.jsonc" },
				miniflare: {
					bindings: {
						JWT_SECRET: TEST_JWT_SECRET,
					},
				},
			},
		},
	},
});
