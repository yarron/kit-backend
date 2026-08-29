import { connect, disconnect, model, Schema } from "mongoose";
import { parseMongoUrl } from "../src/utils/url.util";

/**
 * Показать, использует ли запрос индекс.
 *
 * `pnpm explain` — и ты видишь по каждому горячему запросу, был ли это
 * IXSCAN (по индексу) или COLLSCAN (перебор всей коллекции).
 *
 * Зачем скриптом, а не «посмотрю глазами»: наличие индекса и ЕГО ИСПОЛЬЗОВАНИЕ
 * — разные вещи. Индекс `{status, createdAt}` не поможет запросу, который
 * сортирует по `createdAt` и фильтрует по `userId`; порядок полей в составном
 * индексе значим, и на глаз это не проверяется.
 *
 * И главное: COLLSCAN на пустой базе работает мгновенно. Проблема появляется
 * ровно тогда, когда данных стало много, — то есть в проде, внезапно и сразу.
 */

const ORDER_STATUSES = ["Pending", "Queued", "Fulfilled"] as const;

/** Запросы, которые приложение реально выполняет. Добавляй сюда свои. */
const QUERIES: Array<{
	name: string;
	collection: string;
	filter: Record<string, unknown>;
	sort?: Record<string, 1 | -1>;
}> = [
	{
		name: "flush-крон: незакрытые заказы, старые первыми",
		collection: "orders",
		filter: { status: ORDER_STATUSES[0] },
		sort: { createdAt: 1 },
	},
	{
		name: "захват заказа по id и статусу",
		collection: "orders",
		filter: { _id: "000000000000000000000000", status: ORDER_STATUSES[1] },
	},
	{
		name: "повтор по ключу идемпотентности",
		collection: "orders",
		filter: { idempotencyKey: "whatever" },
	},
	{
		name: "заказы пользователя",
		collection: "orders",
		filter: { userId: "u1" },
		sort: { createdAt: -1 },
	},
	{
		name: "список пользователей (без удалённых)",
		collection: "users",
		filter: { deletedAt: { $exists: false } },
		sort: { _id: -1 },
	},
];

interface Stage {
	stage?: string;
	inputStage?: Stage;
	indexName?: string;
}

/**
 * Стадии, означающие «пошли по индексу».
 *
 * Не только IXSCAN: MongoDB умеет короткие пути для простых запросов по
 * уникальному ключу — `IDHACK` и семейство `EXPRESS_*`. Они индекс используют,
 * просто плана как такового не строят.
 */
const INDEX_STAGES = ["IXSCAN", "IDHACK", "DISTINCT_SCAN"];
const isIndexStage = (stage: string): boolean =>
	INDEX_STAGES.includes(stage) || stage.startsWith("EXPRESS_");

/** Рекурсивно найти, чем на самом деле кончился план. */
function describePlan(stage: Stage | undefined): { kind: string; index?: string } {
	if (!stage) return { kind: "unknown" };
	if (stage.stage && isIndexStage(stage.stage)) {
		return { kind: stage.stage, index: stage.indexName };
	}
	if (stage.stage === "COLLSCAN") return { kind: "COLLSCAN" };
	return describePlan(stage.inputStage);
}

async function main(): Promise<void> {
	const { uri, dbName } = parseMongoUrl(process.env.MONGODB_URL);
	if (!uri) throw new Error("MONGODB_URL не задан");

	await connect(uri, { dbName });

	// strict: false — работаем с существующими коллекциями как есть,
	// схема тут не нужна: нас интересует план, а не документы.
	const loose = new Schema({}, { strict: false });

	let problems = 0;
	let unknowns = 0;

	for (const q of QUERIES) {
		const Model = model(`explain_${q.collection}`, loose, q.collection);
		let cursor = Model.find(q.filter);
		if (q.sort) cursor = cursor.sort(q.sort);

		const plan = await cursor.explain("executionStats");
		const stats = (plan as { executionStats?: Record<string, number> })
			.executionStats;
		const winning = (
			plan as { queryPlanner?: { winningPlan?: Stage } }
		).queryPlanner?.winningPlan;

		const { kind, index } = describePlan(winning);
		const examined = stats?.totalDocsExamined ?? 0;
		const returned = stats?.nReturned ?? 0;

		// Три исхода, а не два. «Не разобрали план» — это НЕ «всё хорошо»:
		// молча засчитывать непонятное за успех — тот же ложный зелёный,
		// от которого этот скрипт и должен спасать.
		const verdict =
			kind === "COLLSCAN" ? "✗" : kind === "unknown" ? "?" : "✓";
		if (kind === "COLLSCAN") problems += 1;
		if (kind === "unknown") unknowns += 1;

		console.log(
			`${verdict} ${q.name}\n` +
				`    план: ${kind}${index ? ` (${index})` : ""}` +
				`  просмотрено: ${examined}  возвращено: ${returned}`,
		);
	}

	if (problems > 0) {
		console.log(
			`\n${problems} запрос(ов) перебирают коллекцию целиком (COLLSCAN).\n` +
				"На пустой базе это незаметно — станет заметно ровно в проде.",
		);
	} else if (unknowns > 0) {
		console.log(
			`\n${unknowns} план(ов) не разобрано. Это не «хорошо», это «неизвестно»:\n` +
				"посмотри вывод explain руками, прежде чем считать запрос здоровым.",
		);
	} else {
		console.log("\nВсе запросы идут по индексу.");
	}

	await disconnect();
}

main().catch((error) => {
	console.error("explain failed:", error);
	process.exit(1);
});
