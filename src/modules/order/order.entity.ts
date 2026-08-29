import { Field, Float, Int, ObjectType } from "@nestjs/graphql";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";
import { OrderStatusEnum } from "./order.enum";

@Schema({ collection: "orders", timestamps: true, versionKey: false })
@ObjectType({ description: "Customer order" })
export class OrderEntity {
	@Field(() => String)
	_id: string;

	@Prop({ type: String, required: true, index: true })
	@Field(() => String)
	userId: string;

	@Prop({ type: Number, required: true })
	@Field(() => Float)
	totalUsd: number;

	@Prop({
		type: String,
		required: true,
		enum: Object.values(OrderStatusEnum),
		default: OrderStatusEnum.Pending,
		index: true,
	})
	@Field(() => OrderStatusEnum)
	status: OrderStatusEnum;

	/**
	 * The client's own key for this order.
	 *
	 * This is the single most valuable column in the collection. A customer's
	 * browser retries a failed POST; a mobile client resends on reconnect; your
	 * own queue re-runs a job after a lock expiry. Without a unique key on
	 * something the CLIENT chose, every one of those charges twice.
	 *
	 * `unique: true` and let the index reject the second insert.
	 */
	@Prop({ type: String, required: true, unique: true, index: true })
	@Field(() => String)
	idempotencyKey: string;

	@Prop({ type: Number, required: true, default: 0 })
	@Field(() => Int)
	attempts: number;

	/** The provider's own id, once it has accepted the order. */
	@Prop({ type: String, required: false })
	@Field(() => String, { nullable: true })
	providerRef?: string;

	@Prop({ type: String, required: false })
	@Field(() => String, { nullable: true })
	lastError?: string;

	@Prop({ type: Date, required: false })
	@Field(() => Date, { nullable: true })
	fulfilledAt?: Date;

	@Field(() => Date)
	createdAt: Date;

	@Field(() => Date)
	updatedAt: Date;
}

export type OrderDocument = HydratedDocument<OrderEntity>;
export const OrderSchema = SchemaFactory.createForClass(OrderEntity);

/**
 * A compound index for the query the flush cron runs every minute:
 * `find({ status: Pending }).sort({ createdAt: 1 })`.
 *
 * Order matters — equality field first, then the sort field. The reverse order
 * still "works" and still scans. Check with `.explain()`, never by eye.
 */
OrderSchema.index({ status: 1, createdAt: 1 });
