import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { BullBoardModule } from "@bull-board/nestjs";
import { ClickHouseModule } from "@libs/clickhouse/src";
import { PrismaModule } from "@libs/prisma/src";
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { GraphQLModule } from "@nestjs/graphql";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { TerminusModule } from "@nestjs/terminus";
import { ThrottlerModule } from "@nestjs/throttler";
import { SentryModule } from "@sentry/nestjs/setup";
import { ServiceTokenGuard } from "@src/guard/service-token.guard";
import basicAuth from "express-basic-auth";
import { RedisModule } from "nestjs-redis-box";
import { CONFIG } from "../config";
import { modules } from "../modules/modules";
import { AppController } from "./app.controller";
import { QueueName } from "./app.enum";
import { AppExceptionFilter } from "./exception/app.filter";
import { GqlThrottlerGuard } from "./gql-throttler.guard";
import { LoggingInterceptor } from "./interceptors/logging.interceptor";
import { mongoConnectionOptions } from "./mongo-indexes";
import { RedisLifecycle } from "./redis-lifecycle.provider";

/**
 * The composition root. Nothing here has business logic — it wires
 * infrastructure and hands it to the feature modules.
 *
 * Queues are registered from the `QueueName` enum rather than listed by hand,
 * so a new queue automatically appears in BullBoard. The alternative is the
 * classic bug: the queue exists, jobs pile up in it, and it is invisible in the
 * dashboard because someone forgot the second registration.
 */
const allQueues = Object.values(QueueName);

const bullQueues = allQueues.map((name) =>
	BullModule.registerQueue({
		name,
		// Without this the process does not exit on shutdown.
		//
		// `queue.close()` stops the queue but leaves the ioredis socket open —
		// `forceDisconnectOnShutdown` (default false) is what actually tears it
		// down. Symptoms: Jest prints "did not exit one second after the test run"
		// and hangs in CI, and in production the container survives SIGTERM until
		// the platform kills it.
		//
		// The usual workaround is `jest --forceExit`, which hides the test symptom
		// and keeps the production one.
		forceDisconnectOnShutdown: true,
	}),
);

const bullBoardFeatures = allQueues.map((name) =>
	BullBoardModule.forFeature({ name, adapter: BullMQAdapter }),
);

@Module({
	controllers: [AppController],
	imports: [
		...modules,
		...bullQueues,
		...bullBoardFeatures,

		MongooseModule.forRoot(
			CONFIG.mongodb.connection,
			mongoConnectionOptions({ dbName: CONFIG.mongodb.dbName }),
		),

		RedisModule.register(CONFIG.redis),
		BullModule.forRoot(CONFIG.redis),
		ClickHouseModule.register(CONFIG.clickhouse),

		// Postgres подключается ТОЛЬКО если задан DATABASE_URL. Иначе приложение
		// работает на Mongo и не пытается достучаться до базы, которой нет.
		...(CONFIG.postgres.url
			? [PrismaModule.register({ db: CONFIG.postgres })]
			: []),

		GraphQLModule.forRootAsync(CONFIG.graphqlFn(modules)),

		// Подхватывает Sentry.init из instrument.ts и вешает трейсинг на Nest.
		SentryModule.forRoot(),

		// Enables @Cron decorators anywhere in the app.
		ScheduleModule.forRoot(),
		TerminusModule,

		// Лимит на источник. Числа — про то, сколько ДОЛЖЕН делать нормальный
		// клиент, а не про то, сколько выдержит сервер.
		ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),

		BullBoardModule.forRoot({
			route: "/que",
			adapter: ExpressAdapter,
			// The dashboard can retry, delete and inspect job payloads. Payloads
			// contain customer data. It is never left open.
			middleware: [
				basicAuth({
					challenge: true,
					users: { admin: CONFIG.platform.apiKey },
				}),
			],
		}),
	],
	providers: [
		AppExceptionFilter,
		RedisLifecycle,
		// Порядок значим: сперва «свой ли сервис», потом «не частит ли».
		// Считать лимит для запроса, который всё равно будет отвергнут, —
		// это тратить бюджет лимита на чужие запросы.
		{ provide: APP_GUARD, useClass: ServiceTokenGuard },
		{ provide: APP_GUARD, useClass: GqlThrottlerGuard },
		// Одна строка на запрос: что, кто, сколько, чем кончилось.
		{ provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
	],
})
export class AppModule {}

export * from "./mongo-indexes";
