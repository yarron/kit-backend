import { Field, Float, Int, ObjectType } from "@nestjs/graphql";

/**
 * ClickHouse READ models. No `@Schema`, no `@Prop` — these rows do not live in
 * Mongo and are never written through Mongoose.
 *
 * Keeping the analytics types physically separate from the operational entities
 * is deliberate. They answer different questions and they drift on different
 * schedules: `OrderEntity` is the current state of one order, `OrderEventEntity`
 * is the immutable history of what happened to it.
 */
@ObjectType({ description: "One immutable order event" })
export class OrderEventEntity {
	/** Synthetic, for cache normalisation on the frontend. */
	@Field(() => String)
	_id: string;

	@Field(() => String)
	orderId: string;

	@Field(() => String)
	userId: string;

	@Field(() => String)
	eventType: string;

	@Field(() => String)
	status: string;

	@Field(() => Float)
	totalUsd: number;

	@Field(() => String)
	provider: string;

	@Field(() => Date)
	occurredAt: Date;
}

@ObjectType({ description: "Daily order aggregate" })
export class DailyStatEntity {
	@Field(() => String)
	day: string;

	@Field(() => String)
	eventType: string;

	@Field(() => Int)
	events: number;

	@Field(() => Int)
	users: number;

	@Field(() => Float)
	totalUsd: number;
}
