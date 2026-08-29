import {
	Injectable,
	Logger,
	type OnModuleDestroy,
	type OnModuleInit,
} from "@nestjs/common";
import { reportError } from "@utils/report-error.util";
import { PrismaClient } from "../../../../prisma/generated";
import { applyExtensions } from "./prisma.extension";
import type { PrismaOptions } from "./prisma.interface";

/**
 * База для доменных сервисов на Postgres — зеркало `MongooseService`.
 *
 * Два решения, которые стоит понять до копирования:
 *
 * 1. **Пул соединений задаётся в URL.** У Postgres жёсткий потолок соединений
 *    (обычно 100), а каждый контейнер поднимает свой пул. Три реплики по
 *    дефолтным настройкам съедают его целиком, и следующий деплой не сможет
 *    подключиться. Поэтому параметры дописываются в строку принудительно.
 *
 * 2. **Расширения нельзя применить к `this`.** `$extends()` возвращает НОВЫЙ
 *    объект, а не мутирует существующий, — поэтому расширенный клиент лежит
 *    в отдельном поле `db`. Доменные сервисы ходят через него, а не через
 *    `this` напрямую: иначе soft-delete молча не сработает.
 */
@Injectable()
export class PrismaService
	extends PrismaClient
	implements OnModuleInit, OnModuleDestroy
{
	static _options: PrismaOptions;

	private readonly prismaLogger = new Logger(PrismaService.name);

	/** Клиент С расширениями. Доменный код обязан ходить сюда. */
	// biome-ignore lint/suspicious/noExplicitAny: тип расширенного клиента вычисляется Prisma
	readonly db: any;

	constructor() {
		const { url, logging } = PrismaService._options.db;

		super({
			datasources: { db: { url: PrismaService.withPool(url) } },
			log: logging ? ["query", "info", "warn", "error"] : ["warn", "error"],
		});

		this.db = applyExtensions(this);
	}

	/** Дописывает параметры пула, если их нет в строке подключения. */
	private static withPool(url: string): string {
		try {
			const parsed = new URL(url);
			const defaults: Record<string, string> = {
				connection_limit: "10",
				pool_timeout: "20",
				connect_timeout: "30",
			};
			for (const [key, value] of Object.entries(defaults)) {
				if (!parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
			}
			return parsed.toString();
		} catch {
			// Невалидный URL — пусть Prisma ругается своим сообщением, оно понятнее
			// нашего. Отдаём как есть; ошибку увидим на $connect.
			return url;
		}
	}

	async onModuleInit(): Promise<void> {
		await this.$connect();
		this.prismaLogger.log("Postgres connected");
	}

	async onModuleDestroy(): Promise<void> {
		try {
			await this.$disconnect();
		} catch (error) {
			reportError(this.prismaLogger, error, {
				operation: "prisma.disconnect",
				level: "warning",
			});
		}
	}
}
