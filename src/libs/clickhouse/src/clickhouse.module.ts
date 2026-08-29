import { type DynamicModule, Module } from "@nestjs/common";
import type { ClickHouseOptions } from "./clickhouse.interface";
import { ClickHouseService } from "./clickhouse.service";

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic-module convention
export class ClickHouseModule {
	static register(options: ClickHouseOptions): DynamicModule {
		ClickHouseService._options = options;

		return {
			module: ClickHouseModule,
			providers: [ClickHouseService],
			exports: [ClickHouseService],
			global: true,
		};
	}
}
