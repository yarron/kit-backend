import { Logger } from "@nestjs/common";
import * as Sentry from "@sentry/nestjs";
import { reportError } from "./report-error.util";

jest.mock("@sentry/nestjs", () => ({ captureException: jest.fn() }));

describe("reportError", () => {
	let logger: Logger;

	beforeEach(() => {
		jest.clearAllMocks();
		logger = { error: jest.fn(), warn: jest.fn() } as unknown as Logger;
	});

	// The rule the whole project stands on: nothing is ever swallowed silently.
	it("both logs AND reports — never only one of the two", () => {
		const error = new Error("upstream exploded");

		reportError(logger, error, { operation: "order.fulfil" });

		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining("[order.fulfil] upstream exploded"),
		);
		expect(Sentry.captureException).toHaveBeenCalledWith(
			error,
			expect.objectContaining({ tags: { operation: "order.fulfil" } }),
		);
	});

	it("puts the context into the log line so it is greppable", () => {
		reportError(logger, new Error("nope"), {
			operation: "analytics.record",
			extra: { orderId: "o1" },
		});

		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining('{"orderId":"o1"}'),
		);
	});

	it("warning level downgrades the log but still reports", () => {
		reportError(logger, new Error("blip"), {
			operation: "redis.quit",
			level: "warning",
		});

		expect(logger.warn).toHaveBeenCalled();
		expect(logger.error).not.toHaveBeenCalled();
		expect(Sentry.captureException).toHaveBeenCalled();
	});

	it("handles a thrown non-Error without losing it", () => {
		reportError(logger, "just a string", { operation: "weird" });

		expect(logger.error).toHaveBeenCalledWith(
			expect.stringContaining("just a string"),
		);
		expect(Sentry.captureException).toHaveBeenCalledWith(
			"just a string",
			expect.anything(),
		);
	});
});
