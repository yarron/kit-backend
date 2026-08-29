import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { RedisCacheService } from "nestjs-redis-box";

/**
 * Closes the Redis connection on shutdown.
 *
 * `RedisCacheService` opens a connection in `onModuleInit` and does NOT
 * implement `onModuleDestroy` — so `app.close()` leaves the socket open. Two
 * consequences, and the second is the one that costs you a day:
 *
 *  - in production, SIGTERM does not release the connection; the process lingers
 *    until the platform kills it, and in-flight work dies with it;
 *  - in tests, Jest prints "did not exit one second after the test run" and
 *    hangs forever in CI.
 *
 * The usual "fix" for the second one is `--forceExit`, which hides the first.
 * Closing it here fixes both.
 */
@Injectable()
export class RedisLifecycle implements OnModuleDestroy {
	private readonly logger = new Logger(RedisLifecycle.name);

	constructor(private readonly redis: RedisCacheService) {}

	async onModuleDestroy(): Promise<void> {
		try {
			await this.redis.quit();
		} catch (error) {
			this.logger.warn(`redis quit failed: ${String(error)}`);
		}
	}
}
