import "reflect-metadata";

/**
 * E2E tests talk to the real databases from docker-compose.
 *
 * Failing loudly on a missing variable beats connecting to a default: the
 * default is `localhost:27017`, which on a developer's machine is very often
 * ANOTHER project's database. Wiping it during a test run is a memorable
 * afternoon.
 */
process.env.NODE_ENV = "test";
process.env.TZ = "UTC";

const required = ["MONGODB_URL", "REDIS_URL"];

beforeAll(() => {
	for (const name of required) {
		if (!process.env[name]) {
			throw new Error(
				`${name} is required for e2e tests. Run them via "pnpm test:e2e" (env-cmd -e TEST).`,
			);
		}
	}

	if (!/test/i.test(process.env.MONGODB_URL ?? "")) {
		throw new Error(
			`Refusing to run e2e against ${process.env.MONGODB_URL} — the database name must contain "test".`,
		);
	}
});

jest.setTimeout(60_000);
