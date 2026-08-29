import { Controller, Get } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { ApiTags } from "@nestjs/swagger";
import {
	HealthCheck,
	HealthCheckService,
	type HealthIndicatorResult,
} from "@nestjs/terminus";
import { Public } from "@src/guard/public.decorator";
import type { Connection } from "mongoose";
import { RedisCacheService } from "nestjs-redis-box";

/**
 * `/health` is what the hosting platform polls to decide whether this container
 * is allowed to receive traffic.
 *
 * It checks the DEPENDENCIES, not just the process. A process that is up but
 * cannot reach Mongo will accept every request and fail every one of them —
 * and the platform, seeing a 200, will happily route production traffic to it.
 */
@ApiTags("Application")
@Controller()
export class AppController {
	constructor(
		private readonly health: HealthCheckService,
		private readonly redis: RedisCacheService,
		@InjectConnection() private readonly mongo: Connection,
	) {}

	@Public()
	@Get()
	root(): string {
		return "Service is running.";
	}

	// Публичный: платформа опрашивает его без секретов, и он не отдаёт данных.
	@Public()
	@Get("health")
	@HealthCheck()
	check() {
		return this.health.check([
			async (): Promise<HealthIndicatorResult> => ({
				redis: {
					status: this.redis.status === "ready" ? "up" : "down",
					state: this.redis.status,
				},
			}),
			async (): Promise<HealthIndicatorResult> => {
				// 1 = connected. Anything else means queries will fail.
				const up = this.mongo.readyState === 1;
				return {
					mongodb: { status: up ? "up" : "down", state: this.mongo.readyState },
				};
			},
		]);
	}
}
