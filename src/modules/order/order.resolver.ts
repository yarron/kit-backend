import { FilterGetInput } from "@app/graphql/graphql.input";
import { UseGuards } from "@nestjs/common";
import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { ApiKeyGuard } from "@src/guard/api-key.guard";
import { OrderEntity } from "./order.entity";
import { shouldFulfilNow } from "./order.helpers";
import { OrderCreateInput } from "./order.input";
import { OrdersOutput } from "./order.output";
import { OrderQueue } from "./order.queue";
import { OrderService } from "./order.service";

@UseGuards(ApiKeyGuard)
@Resolver(() => OrderEntity)
export class OrderResolver {
	constructor(
		private readonly orderService: OrderService,
		private readonly orderQueue: OrderQueue,
	) {}

	@Query(() => OrdersOutput, { description: "Paginated list of orders" })
	async orders(
		@Args("payload", { type: () => FilterGetInput }) payload: FilterGetInput,
	): Promise<OrdersOutput> {
		return this.orderService.listEx<OrdersOutput>(payload);
	}

	@Query(() => OrderEntity, { nullable: true })
	async order(@Args("id", { type: () => String }) id: string) {
		return this.orderService.findById(id);
	}

	/**
	 * Create the order, then hand the slow part to a queue.
	 *
	 * The mutation returns as soon as the order is DURABLE — written to Mongo.
	 * It does not wait for the provider. Doing the charge inline would mean the
	 * customer's request hangs for the provider's latency, a timeout loses the
	 * work entirely, and a provider outage takes your API down with it.
	 */
	@Mutation(() => OrderEntity, { description: "Create an order (idempotent)" })
	async orderCreate(
		@Args("payload", { type: () => OrderCreateInput })
		payload: OrderCreateInput,
	): Promise<OrderEntity> {
		const order = await this.orderService.create(payload);

		if (shouldFulfilNow(order.totalUsd, this.orderService.minTotalUsd)) {
			await this.orderQueue.enqueueFulfil(order._id);
		}
		// Below the floor: the flush cron will batch it. Nothing is lost, it is
		// simply not urgent.

		return order;
	}
}
