import { UseGuards } from "@nestjs/common";
import { Args, Int, Query, Resolver } from "@nestjs/graphql";
import { ApiKeyGuard } from "@src/guard/api-key.guard";
import { DailyStatEntity, OrderEventEntity } from "./analytics.entity";
import { AnalyticsService } from "./analytics.service";

@UseGuards(ApiKeyGuard)
@Resolver(() => OrderEventEntity)
export class AnalyticsResolver {
	constructor(private readonly analytics: AnalyticsService) {}

	@Query(() => [OrderEventEntity], {
		description: "Event history of one order",
	})
	async orderEvents(
		@Args("orderId", { type: () => String }) orderId: string,
		@Args("limit", { type: () => Int, nullable: true, defaultValue: 50 })
		limit: number,
	): Promise<OrderEventEntity[]> {
		return this.analytics.findOrderEvents(orderId, limit);
	}

	@Query(() => [DailyStatEntity], {
		description: "Aggregates for one day (YYYY-MM-DD)",
	})
	async dailyStats(
		@Args("day", { type: () => String }) day: string,
	): Promise<DailyStatEntity[]> {
		return this.analytics.dailySummary(day);
	}
}
