/**
 * Every queue and every job name in the application, in one file.
 *
 * Not for tidiness — for the review question "do we really need a new queue?".
 * A queue is a separate worker pool with its own concurrency and its own lock
 * duration. Two job types that differ only in what they do belong in the SAME
 * queue as two job NAMES. You add a queue when you need different concurrency,
 * a different lock duration, or isolation from a noisy neighbour — and you
 * write down which one it was.
 *
 * Names are string literals, and jobs already sitting in Redis carry the old
 * value. Renaming one is a data migration, not a rename.
 */

export enum QueueName {
	/**
	 * The money path: create → fulfil → confirm.
	 * Low concurrency on purpose — it talks to a rate-limited provider.
	 */
	ORDER = "order",

	/**
	 * Everything that can be late without anyone noticing: rollups, cleanup,
	 * retries of stale work. Separated from ORDER so a slow nightly rollup can
	 * never starve a customer's order.
	 */
	MAINTENANCE = "maintenance",
}

export enum JobName {
	/** Send one order to the provider. */
	FULFILL_ORDER = "FULFILL_ORDER",
	/** Verify, some seconds later, that the provider really took it. */
	CONFIRM_ORDER = "CONFIRM_ORDER",
	/** Release orders that have been waiting below the minimum total. */
	FLUSH_PENDING_ORDERS = "FLUSH_PENDING_ORDERS",
	/** Aggregate yesterday's events into the analytics store. */
	ROLLUP_DAILY_STATS = "ROLLUP_DAILY_STATS",
}

/**
 * BullMQ priority: LOWER number wins. Priorities only order the WAITING list —
 * they do not preempt a running job, and they do not free a busy worker slot.
 * If a slow job type is starving a fast one, the answer is a separate queue,
 * not a priority.
 */
export const OrderJobPriority = {
	FULFILL_ORDER: 1,
	CONFIRM_ORDER: 5,
} as const;

export const MaintenanceJobPriority = {
	FLUSH_PENDING_ORDERS: 1,
	ROLLUP_DAILY_STATS: 10,
} as const;

export enum ErrorMsgEnum {
	EntityNotExist = "The requested entity does not exist.",
	Forbidden = "Not allowed.",
}
