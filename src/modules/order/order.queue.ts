import {
	JobName,
	MaintenanceJobPriority,
	OrderJobPriority,
	QueueName,
} from "@app/app.enum";
import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
	COMPLETED_JOB_RETENTION,
	CONFIG,
	FAILED_JOB_RETENTION,
} from "@src/config";
import type { Queue } from "bullmq";

/**
 * Everything that PUTS work on a queue lives here; everything that TAKES work
 * off one lives in `processors/`.
 *
 * The split is worth keeping even when a module only has two jobs. Producers
 * are called from resolvers, crons and other services; consumers run in a
 * worker with different concurrency and different failure semantics. Mixing
 * them in one class is how a cron ends up calling a processor method directly
 * and silently bypassing the queue — no retries, no visibility, no backoff.
 */
@Injectable()
export class OrderQueue {
	private readonly logger = new Logger(OrderQueue.name);

	constructor(
		@InjectQueue(QueueName.ORDER) private readonly orderQueue: Queue,
		@InjectQueue(QueueName.MAINTENANCE)
		private readonly maintenanceQueue: Queue,
	) {}

	/**
	 * Release orders that have been waiting below the minimum total.
	 *
	 * `jobId` is fixed so two containers running this cron at the same second
	 * enqueue ONE job, not two. And `removeOnComplete: true` is mandatory with a
	 * fixed jobId: BullMQ deduplicates against completed jobs too, so a retained
	 * completed `flush-pending` would silently swallow every later add until it
	 * aged out. That failure is invisible — the cron keeps firing, the queue
	 * stays empty, and nothing is logged.
	 */
	@Cron(CronExpression.EVERY_MINUTE)
	async scheduleFlush(): Promise<void> {
		try {
			await this.maintenanceQueue.add(
				JobName.FLUSH_PENDING_ORDERS,
				{},
				{
					jobId: `flush-pending-${Math.floor(Date.now() / 60_000)}`,
					priority: MaintenanceJobPriority.FLUSH_PENDING_ORDERS,
					removeOnComplete: true,
					removeOnFail: FAILED_JOB_RETENTION,
				},
			);
		} catch (error) {
			// Never swallow silently. A cron that fails quietly looks exactly like
			// a cron that has nothing to do.
			this.logger.error(
				`scheduleFlush failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/** Yesterday's rollup, after midnight UTC with a few minutes of slack. */
	@Cron("10 0 * * *")
	async scheduleDailyRollup(): Promise<void> {
		const day = new Date(Date.now() - 24 * 60 * 60 * 1000)
			.toISOString()
			.slice(0, 10);

		try {
			await this.maintenanceQueue.add(
				JobName.ROLLUP_DAILY_STATS,
				{ day },
				{
					// Date in the id: one rollup per day, and a manual re-run for a
					// different day is not blocked by today's.
					jobId: `rollup-${day}`,
					priority: MaintenanceJobPriority.ROLLUP_DAILY_STATS,
					removeOnComplete: true,
					removeOnFail: FAILED_JOB_RETENTION,
				},
			);
		} catch (error) {
			this.logger.error(
				`scheduleDailyRollup failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/** Queue one order for fulfilment. */
	async enqueueFulfil(orderId: string): Promise<void> {
		await this.orderQueue.add(
			JobName.FULFILL_ORDER,
			{ orderId },
			{
				// One in-flight fulfilment per order, whoever asks and however often.
				jobId: `fulfill-${orderId}`,
				priority: OrderJobPriority.FULFILL_ORDER,
				attempts: CONFIG.order.maxAttempts,
				// Exponential backoff with jitter. Without jitter, everything that
				// failed during one provider outage retries in the same millisecond
				// and causes the second outage.
				backoff: { type: "exponential", delay: 1_000, jitter: 0.5 },
				removeOnComplete: COMPLETED_JOB_RETENTION,
				removeOnFail: FAILED_JOB_RETENTION,
			},
		);
	}

	/**
	 * Check, a minute later, that the provider really took the order.
	 *
	 * "We got a success response" and "the money moved" are different claims.
	 * A delayed verification job is the cheapest way to notice the difference,
	 * and it is the difference that shows up in a reconciliation months later.
	 */
	async enqueueConfirm(orderId: string, delayMs = 60_000): Promise<void> {
		await this.orderQueue.add(
			JobName.CONFIRM_ORDER,
			{ orderId },
			{
				jobId: `confirm-${orderId}`,
				priority: OrderJobPriority.CONFIRM_ORDER,
				delay: delayMs,
				attempts: 2,
				removeOnComplete: COMPLETED_JOB_RETENTION,
				removeOnFail: FAILED_JOB_RETENTION,
			},
		);
	}
}
