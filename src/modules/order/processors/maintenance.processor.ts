import { JobName, QueueName } from "@app/app.enum";
import { AnalyticsService } from "@modules/analytics/analytics.service";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { planBatch } from "../order.helpers";
import { OrderQueue } from "../order.queue";
import { OrderService } from "../order.service";

/**
 * Background work: nobody is waiting for it, so concurrency is 1 and it can be
 * as slow as it needs to be without touching the customer-facing ORDER queue.
 *
 * This is why it is a separate QUEUE and not just a lower priority. Priority
 * orders the waiting list; it does not free a worker slot that a slow rollup is
 * already occupying.
 */
@Processor(QueueName.MAINTENANCE, { concurrency: 1 })
export class MaintenanceProcessor extends WorkerHost {
	private readonly logger = new Logger(MaintenanceProcessor.name);

	constructor(
		private readonly orderService: OrderService,
		private readonly orderQueue: OrderQueue,
		private readonly analytics: AnalyticsService,
	) {
		super();
	}

	async process(job: Job): Promise<unknown> {
		switch (job.name) {
			case JobName.FLUSH_PENDING_ORDERS:
				return this.flushPending();
			case JobName.ROLLUP_DAILY_STATS:
				return this.rollup(job.data as { day: string });
			default:
				this.logger.warn(`unknown job name: ${job.name}`);
				return null;
		}
	}

	private async flushPending(): Promise<unknown> {
		const pending = await this.orderService.findPending(200);
		if (pending.length === 0) return { released: 0 };

		const plan = planBatch(pending, this.orderService.minTotalUsd);

		for (const orderId of plan.release) {
			await this.orderQueue.enqueueFulfil(orderId);
		}

		if (plan.release.length > 0) {
			this.logger.log(
				`released ${plan.release.length} orders ($${plan.releaseTotal.toFixed(2)}), holding ${plan.hold.length}`,
			);
		}

		return { released: plan.release.length, held: plan.hold.length };
	}

	private async rollup(data: { day: string }): Promise<unknown> {
		const summary = await this.analytics.dailySummary(data.day);
		this.logger.log(`rollup ${data.day}: ${summary.length} rows`);
		return { day: data.day, rows: summary.length };
	}
}
