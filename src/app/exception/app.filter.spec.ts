import type { ArgumentsHost } from "@nestjs/common";
import { HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
import { GraphQLError } from "graphql";
import { AppExceptionFilter } from "./app.filter";

const gqlHost = (): ArgumentsHost =>
	({
		getType: () => "graphql",
		getClass: () => class {},
		getHandler: () => () => undefined,
		getArgByIndex: (i: number) =>
			i === 3 ? { path: { key: "q" } } : undefined,
		getArgs: () => [],
	}) as unknown as ArgumentsHost;

describe("AppExceptionFilter (graphql)", () => {
	const filter = new AppExceptionFilter({ httpAdapter: {} } as never);

	const codeOf = (error: unknown): string => {
		try {
			filter.catch(error, gqlHost());
		} catch (thrown) {
			return String((thrown as GraphQLError).extensions?.code);
		}
		throw new Error("filter did not throw");
	};

	const messageOf = (error: unknown): string => {
		try {
			filter.catch(error, gqlHost());
		} catch (thrown) {
			return (thrown as GraphQLError).message;
		}
		throw new Error("filter did not throw");
	};

	// The case that matters: an unexpected error must NOT leak its message.
	// A driver error string tells an attacker your schema and your versions.
	it("hides the message of an unexpected error", () => {
		expect(
			messageOf(new Error("Mongo connection string invalid: mongodb://u:pw@h")),
		).toBe("Internal server error");
		expect(codeOf(new Error("boom"))).toBe("INTERNAL_SERVER_ERROR");
	});

	it("passes a deliberate 4xx message through", () => {
		expect(messageOf(new NotFoundException("Order not found"))).toBe(
			"Order not found",
		);
	});

	it("maps statuses to distinct GraphQL codes", () => {
		// A client must be able to tell "log in again" from "fix your input".
		expect(codeOf(new HttpException("x", HttpStatus.UNAUTHORIZED))).toBe(
			"UNAUTHENTICATED",
		);
		expect(codeOf(new HttpException("x", HttpStatus.FORBIDDEN))).toBe(
			"FORBIDDEN",
		);
		expect(codeOf(new HttpException("x", HttpStatus.CONFLICT))).toBe(
			"CONFLICT",
		);
		expect(codeOf(new HttpException("x", HttpStatus.BAD_REQUEST))).toBe(
			"BAD_REQUEST",
		);
	});

	it("falls back sensibly for a status with no explicit mapping", () => {
		expect(codeOf(new HttpException("x", 418))).toBe("BAD_REQUEST");
		expect(codeOf(new HttpException("x", 503))).toBe("INTERNAL_SERVER_ERROR");
	});

	it("does not crash on a thrown non-Error value", () => {
		expect(codeOf("just a string")).toBe("INTERNAL_SERVER_ERROR");
	});
});
