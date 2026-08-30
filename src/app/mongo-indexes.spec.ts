import { mongoConnectionOptions } from "./mongo-indexes";

/**
 * The cheap half of the guard. The expensive half — that the apply step really
 * creates the unique index — is in order-indexes.e2e-spec.ts, because a unique
 * constraint can only be proven against a real database.
 */
describe("mongoConnectionOptions", () => {
	it("never lets mongoose build indexes on boot", () => {
		// On a large collection this is a heavy operation, and it would run while
		// a deploy is rolling. Indexes are applied by `pnpm db:indexes` instead.
		expect(mongoConnectionOptions({ dbName: "x" }).autoIndex).toBe(false);
	});

	it("is off in every environment, not only production", () => {
		// A setting the test environment switches off is a setting nobody
		// exercises: it sits in production looking healthy and has never run.
		// Here that would mean the apply path is first tried on live data.
		for (const env of ["local", "test", "production"]) {
			process.env.PLATFORM_ENV = env;
			expect(mongoConnectionOptions({ dbName: "x" }).autoIndex).toBe(false);
		}
	});

	it("keeps the pool size, which is per process and not per request", () => {
		expect(mongoConnectionOptions({ dbName: "x" }).maxPoolSize).toBe(20);
	});
});
