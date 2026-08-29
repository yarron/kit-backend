/**
 * UNIT tests. No database, no network, no Nest container — pure logic and
 * services with mocked collaborators. These must stay fast: if a unit test
 * needs docker to be up, it is an e2e test wearing the wrong name.
 */
module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	moduleFileExtensions: ["js", "json", "ts"],
	testMatch: ["<rootDir>/src/**/*.spec.ts"],
	testPathIgnorePatterns: ["/node_modules/", "/dist/", "/src/.*/e2e/"],
	testTimeout: 15000,
	// Jest runs in CommonJS. The project's tsconfig uses NodeNext for the
	// webpack build, and ts-jest warns about the mismatch on every file — so the
	// override lives here rather than weakening the build config.
	transform: {
		"^.+\\.(t|j)s$": [
			"ts-jest",
			{ tsconfig: { module: "commonjs", moduleResolution: "node" } },
		],
	},
	collectCoverageFrom: [
		"src/**/*.(t|j)s",
		"!src/**/*.spec.ts",
		"!src/**/*.e2e-spec.ts",
		"!src/**/*.input.ts",
		"!src/**/*.output.ts",
		"!src/**/*.entity.ts",
		"!src/**/*.enum.ts",
		"!src/**/index.ts",
		"!**/*.d.ts",
	],
	coverageDirectory: "coverage/unit",
	coveragePathIgnorePatterns: ["/node_modules/", "/dist/", "/test/", ".module.ts$"],
	coverageThreshold: {
		global: { branches: 60, functions: 60, lines: 60, statements: 60 },
	},
	moduleNameMapper: {
		"^@src/(.*)$": "<rootDir>/src/$1",
		"^@utils/(.*)$": "<rootDir>/src/utils/$1",
		"^@modules/(.*)$": "<rootDir>/src/modules/$1",
		"^@libs/(.*)$": "<rootDir>/src/libs/$1",
		"^@config/(.*)$": "<rootDir>/src/config.ts",
		"^@app/(.*)$": "<rootDir>/src/app/$1",
	},
	setupFilesAfterEnv: ["<rootDir>/test/unit-setup.ts"],
};
