import { clampOrderTotal, round } from "./money.util";

/**
 * Read this file as a worked example of WHICH cases to write.
 *
 * Notice what is missing: there is almost no "happy path". `round(1.234)` is
 * not interesting — it works in every implementation anyone would write. The
 * cases that catch real bugs are the boundary, the representation error, the
 * sign, and the value that is not a number at all.
 */
describe("round", () => {
	it("rounds half away from zero — including the negative half", () => {
		expect(round(2.345)).toBe(2.35);
		// The one everybody gets wrong: Math.round(-0.5) is -0, so a refund of
		// -0.005 silently becomes 0 and a cent vanishes.
		expect(round(-0.005)).toBe(-0.01);
	});

	it("survives binary floating point", () => {
		// 1.005 * 100 === 100.49999999999999, so the naive
		// Math.round(x * 100) / 100 returns 1.00 here.
		expect(round(1.005)).toBe(1.01);
		expect(round(0.41000000000000003)).toBe(0.41);
	});

	it("returns 0 for values that are not finite", () => {
		expect(round(Number.NaN)).toBe(0);
		expect(round(Number.POSITIVE_INFINITY)).toBe(0);
	});
});

describe("clampOrderTotal", () => {
	const MIN = 10;
	const MAX = 1_000;

	// The most expensive scenario first: an amount below the floor must be
	// SKIPPED, never quietly raised to the floor. Raising it charges a customer
	// for something they did not ask for, and no refund flow makes that free.
	it("below the floor → skip, do not raise to the minimum", () => {
		expect(clampOrderTotal(4, MIN, MAX)).toEqual({
			amount: 4,
			skip: true,
			clamped: false,
		});
	});

	it("exactly at the floor → passes through untouched", () => {
		expect(clampOrderTotal(MIN, MIN, MAX)).toEqual({
			amount: 10,
			skip: false,
			clamped: false,
		});
	});

	it("one cent under the floor is still under the floor", () => {
		expect(clampOrderTotal(9.99, MIN, MAX).skip).toBe(true);
	});

	it("above the ceiling → clamped down and flagged", () => {
		expect(clampOrderTotal(5_000, MIN, MAX)).toEqual({
			amount: 1_000,
			skip: false,
			clamped: true,
		});
	});

	it("negative input is treated as zero and flagged as changed", () => {
		expect(clampOrderTotal(-5, MIN, MAX)).toEqual({
			amount: 0,
			skip: true,
			clamped: true,
		});
	});

	it("NaN is treated as zero rather than propagating", () => {
		// A NaN that reaches the provider becomes a charge of "null".
		expect(clampOrderTotal(Number.NaN, MIN, MAX)).toEqual({
			amount: 0,
			skip: true,
			clamped: true,
		});
	});
});
