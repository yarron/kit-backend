import { JobName, QueueName } from "@app/app.enum";
import { AnalyticsService } from "@modules/analytics/analytics.service";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { OrderStatusEnum } from "../order.enum";
import { isRetryable } from "../order.helpers";
import { OrderQueue } from "../order.queue";
import { OrderService } from "../order.service";
import { PaymentProviderService } from "../payment-provider.service";

interface OrderJobData {
	orderId: string;
}

/**
 * The consumer side of the ORDER queue.
 *
 * `concurrency: 5` is a decision, not a default. It is the number of orders
 * this container will have in flight at the provider simultaneously, so it is
 * really a statement about the provider's rate limit. Raising it to "go faster"
 * is how you get rate-limited and then rate-limited harder on the retries.
 */
@Processor(QueueName.ORDER, { concurrency: 5 })
export class OrderProcessor extends WorkerHost {
	private readonly logger = new Logger(OrderProcessor.name);

	constructor(
		private readonly orderService: OrderService,
		private readonly orderQueue: OrderQueue,
		private readonly provider: PaymentProviderService,
		private readonly analytics: AnalyticsService,
	) {
		super();
	}

	async process(job: Job<OrderJobData>): Promise<unknown> {
		switch (job.name) {
			case JobName.FULFILL_ORDER:
				return this.fulfil(job);
			case JobName.CONFIRM_ORDER:
				return this.confirm(job);
			default:
				// An unknown job name is a deploy skew: an old worker meeting a new
				// producer. Log it loudly rather than failing silently.
				this.logger.warn(`unknown job name: ${job.name}`);
				return null;
		}
	}

	private async fulfil(job: Job<OrderJobData>): Promise<unknown> {
		const { orderId } = job.data;

		// Claim first. If another worker already has it, this returns null and we
		// stop — no error, nothing to fix, that is the system working.
		const order = await this.orderService.claim(orderId);
		if (!order) {
			this.logger.log(`order ${orderId} already claimed or not pending — skip`);
			return { skipped: true };
		}

		try {
			const { providerRef } = await this.provider.charge(
				orderId,
				order.totalUsd,
			);

			await this.orderService.markFulfilled(orderId, providerRef);
			await this.orderQueue.enqueueConfirm(orderId);

			// Analytics is written AFTER the state change, never instead of it. A
			// failure here must not make the order look unfulfilled.
			await this.analytics.recordOrderEvent({
				orderId,
				userId: order.userId,
				eventType: "FULFILLED",
				status: OrderStatusEnum.Fulfilled,
				totalUsd: order.totalUsd,
				provider: "demo",
				occurredAt: new Date(),
			});

			return { providerRef };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			if (
				isRetryable(error) &&
				job.attemptsMade + 1 < (job.opts.attempts ?? 1)
			) {
				// Put it back as Pending so the state is honest between attempts,
				// then rethrow so BullMQ applies its backoff and retries.
				await this.orderService.release(orderId, message);
				this.logger.warn(`order ${orderId} retryable failure: ${message}`);
				throw error;
			}

			await this.orderService.markFailed(orderId, message);
			await this.analytics.recordOrderEvent({
				orderId,
				userId: order.userId,
				eventType: "FAILED",
				status: OrderStatusEnum.Failed,
				totalUsd: order.totalUsd,
				provider: "demo",
				occurredAt: new Date(),
			});

			this.logger.error(`order ${orderId} failed permanently: ${message}`);

			// Swallowed on purpose: the order is in a terminal state and recorded.
			// Rethrowing here would retry a request the provider has rejected.
			return { failed: true, message };
		}
	}

	private async confirm(job: Job<OrderJobData>): Promise<unknown> {
		const { orderId } = job.data;
		const order = await this.orderService.findById(orderId);

		if (!order) {
			this.logger.warn(`confirm: order ${orderId} disappeared`);
			return { missing: true };
		}

		const { providerRef, status } = order as {
			providerRef?: string;
			status: OrderStatusEnum;
		};

		if (status !== OrderStatusEnum.Fulfilled || !providerRef) {
			return { skipped: true, status };
		}

		const ok = await this.provider.verify(providerRef);
		if (!ok) {
			// The provider disagrees with us. Do not silently "fix" the row —
			// a mismatch is a fact a human needs to see.
			this.logger.error(
				`RECONCILE: order ${orderId} marked Fulfilled but provider ref ${providerRef} does not verify`,
			);
		}

		return { verified: ok };
	}
}
