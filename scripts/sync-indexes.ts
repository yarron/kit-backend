import { createConnection } from "mongoose";
import { MONGO_MODELS, syncAllIndexes } from "../src/app/mongo-indexes";
import { parseMongoUrl } from "../src/utils/url.util";

/**
 * Накатить индексы, объявленные в схемах.
 *
 * `pnpm db:indexes` — и все индексы созданы. Отдельной командой, а не на
 * старте приложения: на большой коллекции создание индекса — тяжёлая операция,
 * и делать её в момент выкатки означает, что выкатка в неё упрётся. Поэтому
 * `autoIndex: false`, а этот шаг выполняется осознанно.
 *
 * ⚠️ Пропустить его на свежей базе — значит остаться без unique-индексов,
 * а `unique` в схеме это не правило валидации, а UNIQUE INDEX. Без него
 * повторный `idempotencyKey` вставится молча, и клиента спишут дважды.
 *
 * Nest здесь намеренно НЕ поднимается. Скрипты идут через tsx, а esbuild не
 * эмитит метаданные декораторов — контейнер с внедрением по типам под ним
 * не собирается вовсе. Поэтому голый mongoose и список моделей, который
 * стережёт e2e-тест.
 */
async function main(): Promise<void> {
	const { uri, dbName } = parseMongoUrl(process.env.MONGODB_URL);
	if (!uri) throw new Error("MONGODB_URL не задан");

	const connection = createConnection(uri, { dbName, autoIndex: false });
	for (const { name, schema } of MONGO_MODELS) connection.model(name, schema);
	await connection.asPromise();

	try {
		for (const { model, created, dropped } of await syncAllIndexes(
			connection,
		)) {
			console.log(`${model}: ${created.join(", ")}`);
			if (dropped.length > 0) {
				// Не молчим: syncIndexes удаляет индексы, которых нет в схеме.
				console.log(`  удалены (нет в схеме): ${dropped.join(", ")}`);
			}
		}
	} finally {
		await connection.close();
	}
}

main().catch((error) => {
	// Ошибка наката обязана останавливать деплой: молча пропущенный шаг
	// оставляет базу без unique-индексов, и это выяснится списанием дважды.
	console.error("sync-indexes failed:", error);
	process.exit(1);
});
