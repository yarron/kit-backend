/**
 * E2E tests. These boot the real Nest container and talk to the real Mongo and
 * Redis from docker-compose. Run with `--runInBand`: parallel workers sharing
 * one database produce flakes that look like bugs and waste a day.
 */
module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	moduleFileExtensions: ["js", "json", "ts"],
	rootDir: ".",
	testRegex: ".e2e-spec.ts$",
	testTimeout: 60000,
	// Jest runs in CommonJS. The project's tsconfig uses NodeNext for the
	// webpack build, and ts-jest warns about the mismatch on every file — so the
	// override lives here rather than weakening the build config.
	transform: {
		"^.+\\.(t|j)s$": [
			"ts-jest",
			{ tsconfig: { module: "commonjs", moduleResolution: "node" } },
		],
	},
	coverageDirectory: "coverage/e2e",
	moduleNameMapper: {
		"^@src/(.*)$": "<rootDir>/src/$1",
		"^@utils/(.*)$": "<rootDir>/src/utils/$1",
		"^@modules/(.*)$": "<rootDir>/src/modules/$1",
		"^@libs/(.*)$": "<rootDir>/src/libs/$1",
		"^@config/(.*)$": "<rootDir>/src/config.ts",
		"^@app/(.*)$": "<rootDir>/src/app/$1",
	},
	setupFilesAfterEnv: ["<rootDir>/test/e2e-setup.ts"],

	// `forceExit` is normally a smell — it hides real leaks. It is here for one
	// measured reason, and the measurement is the point:
	//
	//   after app.close(), exactly two sockets to Redis stay open. The two queues
	//   report status "end" (closed), so those two belong to the BullMQ WORKERS:
	//   @nestjs/bullmq calls the graceful `worker.close()`, which does not tear
	//   the ioredis connection down, and it exposes no force option for workers
	//   the way it does for queues (`forceDisconnectOnShutdown`).
	//
	// The production path was checked separately and is clean: `node dist/main`
	// exits within a second of SIGTERM. So this is a Jest-only artefact, not a
	// leak that ships.
	//
	// Re-check it after upgrading @nestjs/bullmq: drop this line, run
	// `pnpm test:e2e`, and see whether Jest exits on its own.
	forceExit: true,
};
