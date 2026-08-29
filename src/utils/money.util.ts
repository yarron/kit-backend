/**
 * Money helpers.
 *
 * Every one of these is a PURE function, and that is the point: pure functions
 * are the cheapest thing in the codebase to test exhaustively, so all the
 * arithmetic that decides money lives here rather than inline in a service.
 * See `money.util.spec.ts` — it covers the boundaries, not the happy path.
 */

/**
 * Round half away from zero, to `digits` decimals.
 *
 * `Math.round` is not enough: it rounds half UP, so `Math.round(-0.5)` is `-0`
 * and a refund silently loses a cent. And the naive `Math.round(x * 100) / 100`
 * breaks on values that cannot be represented in binary floating point —
 * `1.005 * 100` is `100.49999999999999`, which rounds DOWN to 1.00. Going
 * through the exponent form avoids that.
 */
export const round = (value: number, digits = 2): number => {
	if (!Number.isFinite(value)) return 0;
	const sign = value < 0 ? -1 : 1;
	const shifted = Number(`${Math.abs(value)}e${digits}`);
	return sign * (Number(`${Math.round(shifted)}e-${digits}`) || 0);
};

/**
 * Clamp an order total into the range the downstream provider accepts.
 *
 * Returns what to do, not just a number — `skip` means "below the floor, do not
 * send it at all", `clamped` means "we changed the caller's number". Callers
 * that only read the number cannot tell those two apart, and that is exactly
 * the bug that ships: an order below the floor gets sent as the floor, and the
 * customer is charged for something they did not ask for.
 */
export interface ClampResult {
	amount: number;
	skip: boolean;
	clamped: boolean;
}

export const clampOrderTotal = (
	requested: number,
	min: number,
	max: number,
): ClampResult => {
	const safe = Number.isFinite(requested) ? Math.max(0, requested) : 0;

	if (safe < min)
		return { amount: safe, skip: true, clamped: safe !== requested };
	if (safe > max) return { amount: max, skip: false, clamped: true };

	return { amount: safe, skip: false, clamped: safe !== requested };
};
