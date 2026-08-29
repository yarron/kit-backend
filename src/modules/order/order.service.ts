import { ErrorMsgEnum } from "@app/app.enum";
import { GraphqlMongooseService } from "@app/graphql/graphql.mongoose.service";
import {
	BadRequestException,
	ConflictException,
	Injectable,
	Logger,
	NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { CONFIG } from "@src/config";
import { clampOrderTotal, round } from "@utils/money.util";
import type { Model } from "mongoose";
import { type OrderDocument, OrderEntity } from "./order.entity";
import { OrderStatusEnum } from "./order.enum";
import { canTransitionToFulfilled, type PendingOrder } from "./order.helpers";
import type { OrderCreateInput } from "./order.input";

const DUPLICATE_KEY = 11000;

@Injectable()
export class OrderService extends GraphqlMongooseService<
	OrderEntity,
	OrderDocument
> {
	private readonly logger = new Logger(OrderService.name);

	constructor(
		@InjectModel(OrderEntity.name)
		private readonly orderModel: Model<OrderDocument>,
	) {
		super();
		this.model = orderModel;
	}

	/**
	 * Create, or return the order that already exists for this key.
	 *
	 * Note what it does NOT do: throw on a repeat. A client retrying after a
	 * dropped response is not an error, and answering it with a 409 forces every
	 * client to implement "409 means it worked". Returning the existing order
	 * makes the retry genuinely transparent.
	 */
	async create(input: OrderCreateInput): Promise<OrderEntity> {
		if (!Number.isFinite(input.totalUsd) || input.totalUsd <= 0) {
			// The resolver's ValidationPipe already rejects this — but the service
			// is also called from processors and one-off scripts, where no pipe
			// runs. A guard at the service boundary is the one that always holds.
			throw new BadRequestException("Order total must be a positive number");
		}

		// The provider has a hard ceiling per call. Clamping here — at the edge,
		// once — beats discovering it inside the processor, where the order is
		// already durable and the customer already had a success response.
		//
		// `skip` (below the floor) is NOT an error: such an order is accumulated
		// by the flush cron. Above the ceiling IS an error: silently charging less
		// than the customer asked for is worse than refusing.
		const clamped = clampOrderTotal(
			input.totalUsd,
			0,
			CONFIG.order.maxTotalUsd,
		);
		if (clamped.clamped && clamped.amount === CONFIG.order.maxTotalUsd) {
			throw new BadRequestException(
				`Order total exceeds the ${CONFIG.order.maxTotalUsd} limit`,
			);
		}

		try {
			const created = await this.orderModel.create({
				userId: input.userId,
				// Two decimals, rounded half away from zero — see money.util.
				totalUsd: round(clamped.amount),
				idempotencyKey: input.idempotencyKey,
				status: OrderStatusEnum.Pending,
			});
			return created.toObject() as OrderEntity;
		} catch (error) {
			if ((error as { code?: number })?.code === DUPLICATE_KEY) {
				const existing = await this.findOne({
					idempotencyKey: input.idempotencyKey,
				});
				if (existing) {
					this.logger.log(`idempotent replay: ${input.idempotencyKey}`);
					return existing as OrderEntity;
				}
				throw new ConflictException("Duplicate idempotency key");
			}
			throw error;
		}
	}

	/**
	 * Claim an order for processing.
	 *
	 * The status check is INSIDE the update filter, not a separate read. A
	 * read-then-write pair has a window between the two halves, and two workers
	 * that both read `Pending` will both write `Queued` and both charge. A
	 * conditional update is atomic in the database, so exactly one of them gets
	 * a document back and the other gets null.
	 */
	async claim(id: string): Promise<OrderEntity | null> {
		const claimed = await this.orderModel
			.findOneAndUpdate(
				{ _id: id, status: OrderStatusEnum.Pending },
				{ $set: { status: OrderStatusEnum.Queued }, $inc: { attempts: 1 } },
				{ new: true },
			)
			.lean()
			.exec();

		return (claimed as OrderEntity) ?? null;
	}

	async markFulfilled(id: string, providerRef: string): Promise<OrderEntity> {
		const order = await this.findById(id);
		if (!order) throw new NotFoundException(ErrorMsgEnum.EntityNotExist);

		// Second guard, cheap, and it has earned its place: a re-delivered job
		// must not overwrite a terminal state.
		if (!canTransitionToFulfilled((order as OrderEntity).status)) {
			return order as OrderEntity;
		}

		const updated = await this.orderModel
			.findOneAndUpdate(
				{
					_id: id,
					status: { $in: [OrderStatusEnum.Pending, OrderStatusEnum.Queued] },
				},
				{
					$set: {
						status: OrderStatusEnum.Fulfilled,
						providerRef,
						fulfilledAt: new Date(),
						lastError: null,
					},
				},
				{ new: true },
			)
			.lean()
			.exec();

		return (updated ?? order) as OrderEntity;
	}

	async markFailed(id: string, reason: string): Promise<void> {
		await this.orderModel
			.updateOne(
				{ _id: id },
				{
					$set: {
						status: OrderStatusEnum.Failed,
						lastError: reason.slice(0, 500),
					},
				},
			)
			.exec();
	}

	/** Put a claimed order back so the next flush picks it up again. */
	async release(id: string, reason: string): Promise<void> {
		await this.orderModel
			.updateOne(
				{ _id: id, status: OrderStatusEnum.Queued },
				{
					$set: {
						status: OrderStatusEnum.Pending,
						lastError: reason.slice(0, 500),
					},
				},
			)
			.exec();
	}

	/** Oldest first — a queue that serves the newest first starves the oldest. */
	async findPending(limit = 100): Promise<PendingOrder[]> {
		const rows = await this.orderModel
			.find({ status: OrderStatusEnum.Pending })
			.sort({ createdAt: 1 })
			.limit(limit)
			.select({ _id: 1, totalUsd: 1 })
			.lean()
			.exec();

		return rows.map((r) => ({ _id: String(r._id), totalUsd: r.totalUsd }));
	}

	get minTotalUsd(): number {
		return CONFIG.order.minTotalUsd;
	}
}
