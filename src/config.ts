import { graphqlFactory } from "@app/graphql/graphql.utils";
import { ApolloDriver } from "@nestjs/apollo";
import type { Type } from "@nestjs/common";
import {
	parseClickhouseUrl,
	parseMongoUrl,
	parseRedisConnectionString,
} from "@utils/url.util";

/**
 * One typed CONFIG object, read from `process.env` exactly once, at import time.
 *
 * Why not `@nestjs/config` with `ConfigService.get("x.y")` everywhere: that API
 * returns `any` and resolves at runtime, so a typo in a key is a `undefined`
 * you discover in production. A plain frozen object gives you autocomplete, a
 * compile error on a typo, and one place to look when you ask "what does this
 * service actually read from the environment".
 *
 * The trade-off is real and worth naming: this module reads env at import time,
 * so tests that need different values must set `process.env` BEFORE importing
 * it (or inject the value instead of reaching for CONFIG — better).
 */

const mongo = parseMongoUrl(process.env.MONGODB_URL);

/**
 * BullMQ job retention.
 *
 * The default (`removeOnComplete: true`) deletes the job the moment it
 * succeeds, and then an incident report has nothing to stand on. Three days
 * covers a weekend: the user writes on Monday about something that happened on
 * Friday, and the evidence is still there. `count` is the safety net against a
 * traffic spike filling Redis.
 *
 * One trap, and it has bitten a production system: BullMQ deduplicates by
 * `jobId` in ANY state, including `completed`. A repeating job with a FIXED
 * jobId plus retention means the second add is silently swallowed until the
 * first one is evicted. Such jobs must set `removeOnComplete: true` explicitly.
 */
export const COMPLETED_JOB_RETENTION = { age: 60 * 60 * 24 * 3, count: 20_000 };
export const FAILED_JOB_RETENTION = { age: 60 * 60 * 24 * 7, count: 5_000 };

export const CONFIG = {
	platform: {
		// 9800, а не 9000: на 9000 слушает нативный протокол ClickHouse, и на
		// машине, где поднят любой другой проект с CH, порт уже занят. Дефолтные
		// порты — самый частый источник «у меня не стартует».
		port: Number(process.env.PORT) || 9800,
		env: process.env.PLATFORM_ENV || "local",
		origin: process.env.PLATFORM_ORIGIN || "http://localhost:3000",
		/** Guards the GraphQL API, BullBoard and Swagger. Never commit a real one. */
		apiKey: process.env.PLATFORM_KEY || "local-admin-key",
		/**
		 * Общий секрет с фронтом (BFF). Задан → бэкенд принимает запросы только
		 * от своих сервисов. Пусто → проверка выключена (локально), и об этом
		 * пишется предупреждение при старте.
		 */
		serviceToken: process.env.SERVICE_TOKEN || "",
	},

	mongodb: {
		connection: mongo.uri,
		dbName: mongo.dbName ?? "starter",
	},

	redis: {
		options: parseRedisConnectionString(process.env.REDIS_URL),
		connection: {
			...parseRedisConnectionString(process.env.REDIS_URL),
			// BullMQ requires this to be null. With the ioredis default, a long
			// job loses its lock renewal mid-flight and the queue starts
			// re-running work that is already running.
			maxRetriesPerRequest: null,
		},
		isCache: true,
		isTransport: false,
		isGraphql: true,
	},

	postgres: {
		/**
		 * Второй слой хранения. Пусто → весь Prisma-слой (модуль invoice тоже)
		 * просто не поднимается: см. app/index.ts. Так «готовый к включению
		 * слой» остаётся выключаемым одной переменной, а не удалением кода.
		 */
		url: process.env.DATABASE_URL || "",
		logging: process.env.POSTGRES_LOGGING === "true",
	},

	clickhouse: {
		db: {
			...parseClickhouseUrl(process.env.CLICKHOUSE_URL),
			logging: process.env.CLICKHOUSE_LOGGING === "true",
		},
	},

	order: {
		/** Orders below this total are accumulated, not sent one by one. */
		minTotalUsd: Number(process.env.ORDER_MIN_TOTAL) || 10,
		/** Hard ceiling the downstream provider accepts in a single call. */
		maxTotalUsd: Number(process.env.ORDER_MAX_TOTAL) || 10_000,
		/** Attempts before a job is parked in `failed` for a human to look at. */
		maxAttempts: Number(process.env.ORDER_MAX_ATTEMPTS) || 3,
	},

	/**
	 * GraphQL options are built here rather than in `app/index.ts` because the
	 * factory needs the module list, and the module list needs the config — the
	 * indirection breaks that cycle. `driver` picks the server implementation
	 * (Apollo); `useFactory` is evaluated once at boot.
	 */
	graphqlFn: (modules: Type<unknown>[]) => ({
		driver: ApolloDriver,
		useFactory: graphqlFactory(modules),
	}),
};
