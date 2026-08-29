import { Module } from "@nestjs/common";
import { AnalyticsResolver } from "./analytics.resolver";
import { AnalyticsService } from "./analytics.service";

/**
 * No `imports` for ClickHouse: `ClickHouseModule.register()` is declared
 * `global: true` in AppModule, so `ClickHouseService` is injectable anywhere.
 *
 * Global modules are a tool with a sharp edge — used for a shared connection
 * they remove ceremony, used for domain services they hide dependencies and let
 * the module graph rot. Infrastructure only.
 */
@Module({
	providers: [AnalyticsService, AnalyticsResolver],
	exports: [AnalyticsService],
})
export class AnalyticsModule {}

export * from "./analytics.entity";
export * from "./analytics.service";
