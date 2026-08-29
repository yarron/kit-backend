import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { ApiKeyGuard } from "./api-key.guard";

// CONFIG is read at import time, so the env has to be set before the module is
// imported. `jest.mock` with a factory is the clean way to control it.
jest.mock("@src/config", () => ({
	CONFIG: { platform: { apiKey: "correct-key" } },
}));

const httpContext = (headers: Record<string, unknown>): ExecutionContext =>
	({
		getType: () => "http",
		switchToHttp: () => ({ getRequest: () => ({ headers }) }),
	}) as unknown as ExecutionContext;

// GqlExecutionContext.create() copies the class and handler off the context, so
// a mock without them throws before the guard is even reached.
const gqlContext = (headers: Record<string, unknown>): ExecutionContext =>
	({
		getType: () => "graphql",
		getClass: () => class {},
		getHandler: () => () => undefined,
		getArgs: () => [undefined, undefined, { req: { headers } }, undefined],
		getArgByIndex: (i: number) => (i === 2 ? { req: { headers } } : undefined),
	}) as unknown as ExecutionContext;

describe("ApiKeyGuard", () => {
	const guard = new ApiKeyGuard();

	it("accepts the correct key over HTTP", () => {
		expect(guard.canActivate(httpContext({ "x-api-key": "correct-key" }))).toBe(
			true,
		);
	});

	// The bug this catches is the reason the guard has a branch at all: a guard
	// written only for HTTP reads `undefined` inside a resolver. Depending on
	// how defensively it was written it then rejects everyone — or lets
	// everyone in.
	it("reads the request from the GraphQL context too", () => {
		expect(guard.canActivate(gqlContext({ "x-api-key": "correct-key" }))).toBe(
			true,
		);
	});

	it("rejects a missing header", () => {
		expect(() => guard.canActivate(httpContext({}))).toThrow(
			UnauthorizedException,
		);
	});

	it("rejects a wrong key", () => {
		expect(() =>
			guard.canActivate(httpContext({ "x-api-key": "nope" })),
		).toThrow(UnauthorizedException);
	});

	it("rejects a key that is a correct PREFIX of the real one", () => {
		// Length differs, so timingSafeEqual would throw if called — the length
		// check has to come first, and this test is what pins that ordering.
		expect(() =>
			guard.canActivate(httpContext({ "x-api-key": "correct" })),
		).toThrow(UnauthorizedException);
	});

	it("rejects an array-valued header", () => {
		// Duplicate headers arrive as an array. Without the typeof check,
		// Buffer.from(array) succeeds and compares garbage.
		expect(() =>
			guard.canActivate(httpContext({ "x-api-key": ["correct-key"] })),
		).toThrow(UnauthorizedException);
	});
});
