// Sentry ДО всего остального — иначе инструментирование не подхватит
// http/mongo/redis. Порядок импортов здесь значим.
import "./instrument";
import "./preload";

import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppExceptionFilter } from "@src/app/exception/app.filter";
import express from "express";
import helmet from "helmet";
import { AppModule } from "./app";
import { CONFIG } from "./config";

async function bootstrap(): Promise<void> {
	const logger = new Logger("Bootstrap");
	const isDev = CONFIG.platform.env !== "production";

	const app = await NestFactory.create<NestExpressApplication>(AppModule, {
		cors: { origin: CONFIG.platform.origin, credentials: true },
	});

	// Body limit before anything else parses a body. The default is 100kb, which
	// is generous for JSON APIs and generous for an attacker too.
	app.use(express.json({ limit: "512kb" }));

	// `contentSecurityPolicy: false` because the GraphQL playground and BullBoard
	// both load inline scripts. Turn it back on for any HTML you serve yourself.
	app.use(helmet({ contentSecurityPolicy: false }));

	app.useGlobalFilters(app.get(AppExceptionFilter));

	app.useGlobalPipes(
		new ValidationPipe({
			// `transform` turns plain JSON into your DTO class, which is what makes
			// class-validator decorators run at all.
			transform: true,
			// `whitelist` strips properties with no decorator; `forbidNonWhitelisted`
			// rejects them loudly instead. Loud is right: a client sending
			// `{ isAdmin: true }` to an endpoint that never declared it should get a
			// 400, not a silent drop.
			whitelist: true,
			forbidNonWhitelisted: true,
		}),
	);

	// Swagger documents the REST surface (health checks here). GraphQL documents
	// itself. Both are OFF in production — an introspectable schema is a map of
	// your data model handed to anyone who asks.
	if (isDev) {
		SwaggerModule.setup(
			"swg",
			app,
			SwaggerModule.createDocument(
				app,
				new DocumentBuilder()
					.setTitle("NestJS Starter Kit")
					.setVersion("1.0.0")
					.addApiKey(
						{ type: "apiKey", name: "x-api-key", in: "header" },
						"x-api-key",
					)
					.build(),
			),
		);
	}

	// Without this, SIGTERM kills the process mid-job: BullMQ never releases its
	// locks and Mongo connections are dropped, not closed. Every hosting platform
	// sends SIGTERM on deploy, so this is not an edge case — it runs every time.
	app.enableShutdownHooks();

	if (!CONFIG.platform.serviceToken) {
		// Громко: без секрета бэкенд принимает запросы от кого угодно, кто
		// до него дотянулся. Локально это норма, в проде — дыра.
		logger.warn("SERVICE_TOKEN не задан — проверка «свой сервис» выключена");
	}

	// Слушаем на `::`, а не на дефолте.
	//
	// Приватная сеть Railway работает по IPv6. Сервис, слушающий только
	// IPv4, по внутреннему адресу `service.railway.internal` недостижим —
	// и это выглядит как «фронт не видит бэкенд», хотя оба живы. Ошибка
	// не воспроизводится локально вообще.
	await app.listen(CONFIG.platform.port, "::");

	// Печатаем ТОЛЬКО то, что действительно смонтировано. Строка про Swagger
	// в проде, где он отдаёт 404, — это ложный след, по которому кто-то потом
	// полчаса ищет, почему «документация не открывается».
	const base = `http://localhost:${CONFIG.platform.port}`;
	logger.log(`🚀 HTTP      ${base}`);
	logger.log(`🔷 GraphQL   ${base}/gql`);
	logger.log(`🐮 BullBoard ${base}/que`);
	if (isDev) logger.log(`📚 Swagger   ${base}/swg`);
}

bootstrap();
