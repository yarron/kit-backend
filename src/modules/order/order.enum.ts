import { registerEnumType } from "@nestjs/graphql";

export enum OrderStatusEnum {
	/** Created, but below the minimum total — waiting to be batched. */
	Pending = "Pending",
	/** Handed to the queue. A worker owns it now. */
	Queued = "Queued",
	/** The provider accepted it and we verified that it did. */
	Fulfilled = "Fulfilled",
	/** Retries exhausted. A human has to look at it. */
	Failed = "Failed",
	Cancelled = "Cancelled",
}

registerEnumType(OrderStatusEnum, { name: "OrderStatusEnum" });
