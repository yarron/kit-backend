import { OrderStatusEnum } from "./order.enum";
import {
	canTransitionToFulfilled,
	isRetryable,
	planBatch,
	shouldFulfilNow,
} from "./order.helpers";

/**
 * The order of the `describe` blocks here is the order the tests were WRITTEN,
 * and that order is the lesson.
 *
 * The first block is the most expensive irreversible mistake the system can
 * make: charging a customer twice, or charging one who should not have been
 * charged. Not the happy path, not the easy assertion. If you only ever write
 * one test for a piece of money code, write that one.
 */

describe("planBatch — releasing a batch of pending orders", () => {
	it("releases nothing when the group is still below the floor", () => {
		// The whole reason this function exists. A version that releases as soon
		// as it has "some" orders sends sub-floor totals to the provider, which
		// rejects them, and the customer sees a failure they did not cause.
		const plan = planBatch(
			[
				{ _id: "a", totalUsd: 3 },
				{ _id: "b", totalUsd: 4 },
			],
			10,
		);

		expect(plan.release).toEqual([]);
		expect(plan.releaseTotal).toBe(0);
		expect(plan.hold).toEqual(["a", "b"]);
	});

	it("releases only the oldest orders that clear the floor — the rest keep waiting", () => {
		const plan = planBatch(
			[
				{ _id: "a", totalUsd: 6 },
				{ _id: "b", totalUsd: 5 },
				{ _id: "c", totalUsd: 20 },
			],
			10,
		);

		// a + b = 11 clears the floor, so c is NOT dragged along.
		expect(plan.release).toEqual(["a", "b"]);
		expect(plan.releaseTotal).toBe(11);
		expect(plan.hold).toEqual(["c"]);
	});

	it("never releases an order twice", () => {
		const plan = planBatch(
			[
				{ _id: "a", totalUsd: 50 },
				{ _id: "b", totalUsd: 50 },
			],
			10,
		);

		expect(new Set(plan.release).size).toBe(plan.release.length);
		expect(plan.release).not.toEqual(expect.arrayContaining(plan.hold));
	});

	it("exactly at the floor counts as clearing it", () => {
		const plan = planBatch([{ _id: "a", totalUsd: 10 }], 10);
		expect(plan.release).toEqual(["a"]);
	});

	it("treats a corrupt amount as zero instead of poisoning the total", () => {
		// NaN + anything is NaN, and NaN >= 10 is false — so without the guard
		// a single bad row freezes the whole queue forever.
		const plan = planBatch(
			[
				{ _id: "bad", totalUsd: Number.NaN },
				{ _id: "good", totalUsd: 40 },
			],
			10,
		);

		expect(plan.releaseTotal).toBe(40);
		expect(plan.release).toContain("good");
	});

	it("handles an empty list without throwing", () => {
		expect(planBatch([], 10)).toEqual({
			release: [],
			releaseTotal: 0,
			hold: [],
		});
	});
});

describe("canTransitionToFulfilled — the double-charge guard", () => {
	it("allows the first transition", () => {
		expect(canTransitionToFulfilled(OrderStatusEnum.Pending)).toBe(true);
		expect(canTransitionToFulfilled(OrderStatusEnum.Queued)).toBe(true);
	});

	it("refuses a SECOND transition from a terminal state", () => {
		// A queue redelivers. This is the assertion that stops the redelivery
		// from becoming a second charge.
		expect(canTransitionToFulfilled(OrderStatusEnum.Fulfilled)).toBe(false);
		expect(canTransitionToFulfilled(OrderStatusEnum.Failed)).toBe(false);
		expect(canTransitionToFulfilled(OrderStatusEnum.Cancelled)).toBe(false);
	});
});

describe("shouldFulfilNow", () => {
	it("is true at the floor and above, false below", () => {
		expect(shouldFulfilNow(10, 10)).toBe(true);
		expect(shouldFulfilNow(9.99, 10)).toBe(false);
	});

	it("is false for a non-numeric total", () => {
		expect(shouldFulfilNow(Number.NaN, 10)).toBe(false);
	});
});

describe("isRetryable", () => {
	it("retries transient transport failures", () => {
		expect(isRetryable({ code: "ETIMEDOUT" })).toBe(true);
		expect(isRetryable({ code: "ECONNRESET" })).toBe(true);
	});

	it("retries 429 and 5xx", () => {
		expect(isRetryable({ status: 429 })).toBe(true);
		expect(isRetryable({ status: 503 })).toBe(true);
		expect(isRetryable({ response: { status: 502 } })).toBe(true);
	});

	it("does NOT retry a 4xx", () => {
		// Retrying a 400 burns the retry budget a real blip needed and delays
		// telling the customer about a failure that will never resolve itself.
		expect(isRetryable({ status: 400 })).toBe(false);
		expect(isRetryable({ status: 422 })).toBe(false);
	});

	it("does not retry an unknown error shape", () => {
		expect(isRetryable(new Error("boom"))).toBe(false);
		expect(isRetryable(null)).toBe(false);
		expect(isRetryable(undefined)).toBe(false);
	});
});
