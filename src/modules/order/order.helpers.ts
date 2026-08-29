import { OrderStatusEnum } from "./order.enum";

/**
 * Pure decision functions for the order pipeline.
 *
 * Nothing here touches the database, the queue or the clock. That is a design
 * rule, not an accident: these are the rules that decide whether a customer is
 * charged, so they must be testable exhaustively, in milliseconds, with no
 * infrastructure. Everything that needs I/O lives in the service or processor
 * and CALLS these.
 */

/** An order at or above the floor goes out on its own. */
export const shouldFulfilNow = (
	totalUsd: number,
	minTotalUsd: number,
): boolean => Number.isFinite(totalUsd) && totalUsd >= minTotalUsd;

export interface PendingOrder {
	_id: string;
	totalUsd: number;
}

export interface BatchPlan {
	/** Orders that together clear the floor and can be sent. */
	release: string[];
	/** Sum of the released orders. */
	releaseTotal: number;
	/** Orders that stay pending, still below the floor. */
	hold: string[];
}

/**
 * Group pending orders until their combined total clears the floor.
 *
 * The subtle part is what happens to the REMAINDER. Orders are taken oldest
 * first and, once the running total clears the floor, that group is released
 * and the rest stay pending. A version that releases everything as soon as the
 * total clears looks simpler and quietly sends sub-floor orders along for the
 * ride — the provider rejects them and the customer sees a failure they did
 * not cause.
 */
export const planBatch = (
	pending: PendingOrder[],
	minTotalUsd: number,
): BatchPlan => {
	const release: string[] = [];
	let releaseTotal = 0;

	for (const order of pending) {
		const amount = Number.isFinite(order.totalUsd)
			? Math.max(0, order.totalUsd)
			: 0;

		if (releaseTotal >= minTotalUsd) break;

		release.push(order._id);
		releaseTotal += amount;
	}

	// Nothing is released unless the group actually clears the floor. Releasing
	// a group that is still short is the bug this whole function exists to stop.
	if (releaseTotal < minTotalUsd) {
		return { release: [], releaseTotal: 0, hold: pending.map((o) => o._id) };
	}

	const released = new Set(release);

	return {
		release,
		releaseTotal,
		hold: pending.filter((o) => !released.has(o._id)).map((o) => o._id),
	};
};

/**
 * Which failures are worth retrying.
 *
 * Retrying a 400 is free damage: it will fail identically every time, it burns
 * the retry budget that a real blip needed, and it delays the failure the
 * customer is waiting to hear about. Timeouts, 429 and 5xx are transient; 4xx
 * is the provider telling you the request itself is wrong.
 */
export const isRetryable = (error: unknown): boolean => {
	const status =
		(error as { status?: number; response?: { status?: number } })?.status ??
		(error as { response?: { status?: number } })?.response?.status;

	if (typeof status === "number") {
		if (status === 429) return true;
		return status >= 500;
	}

	const code = (error as { code?: string })?.code;
	return (
		code === "ETIMEDOUT" ||
		code === "ECONNRESET" ||
		code === "ECONNREFUSED" ||
		code === "EAI_AGAIN"
	);
};

/**
 * Guard against processing an order twice.
 *
 * A queue gives you AT LEAST ONCE delivery, never exactly once: a worker that
 * dies after charging the provider but before writing the result WILL see the
 * same job again. So the processor's first act is to check the state it is
 * transitioning from, and refuse if the transition has already happened.
 */
export const canTransitionToFulfilled = (status: OrderStatusEnum): boolean =>
	status === OrderStatusEnum.Pending || status === OrderStatusEnum.Queued;
