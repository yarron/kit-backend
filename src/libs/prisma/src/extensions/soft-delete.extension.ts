/**
 * Soft delete для моделей, у которых есть поле `deletedAt`.
 *
 * Расширение делает ДВЕ вещи и намеренно не делает третью:
 *
 *  ✅ подмешивает `deletedAt: null` в чтения — правило, которое иначе каждый
 *     вызывающий должен помнить, а значит где-то уже забыл;
 *  ✅ ЗАПРЕЩАЕТ `delete` / `deleteMany` на таких моделях — громко, с текстом,
 *     куда идти;
 *  ❌ НЕ превращает `delete` в `update` втихую.
 *
 * Про третий пункт стоит сказать отдельно, потому что «умный» вариант
 * напрашивается сам. Он плох по двум причинам. Техническая: `query(args)`
 * внутри расширения выполняет ТУ ЖЕ операцию, а `delete` не принимает `data` —
 * попытка передать его падает в рантайме невнятной ошибкой Prisma. И более
 * важная, смысловая: вызов, который делает не то, что написано, — это ловушка.
 * Человек читает `delete`, ждёт удаления, получает обновление и узнаёт об этом
 * через полгода.
 *
 * Явная ошибка на этапе разработки дешевле любой магии в рантайме.
 */
const SOFT_DELETE_MODELS = ["Invoice"];

const hasSoftDelete = (model: string): boolean =>
	SOFT_DELETE_MODELS.includes(model);

/** Бросается вместо тихой подмены операции. */
export class SoftDeleteViolationError extends Error {
	constructor(model: string, operation: string) {
		super(
			`${model}.${operation}() is disabled: the model is soft-deletable. ` +
				`Use update({ data: { deletedAt: new Date() } }) instead.`,
		);
		this.name = "SoftDeleteViolationError";
	}
}

export const SoftDeleteExtension = {
	name: "SoftDeleteExtension",
	query: {
		$allModels: {
			// biome-ignore lint/suspicious/noExplicitAny: аргументы расширений Prisma не типизуемы обобщённо
			async findMany({ model, args, query }: any) {
				if (hasSoftDelete(model)) {
					args.where = args.where ?? {};
					// Явно переданный deletedAt не трогаем: иногда удалённые нужны.
					if (args.where.deletedAt === undefined) args.where.deletedAt = null;
				}
				return query(args);
			},
			// biome-ignore lint/suspicious/noExplicitAny: см. выше
			async findFirst({ model, args, query }: any) {
				if (hasSoftDelete(model)) {
					args.where = args.where ?? {};
					if (args.where.deletedAt === undefined) args.where.deletedAt = null;
				}
				return query(args);
			},
			// biome-ignore lint/suspicious/noExplicitAny: см. выше
			async count({ model, args, query }: any) {
				if (hasSoftDelete(model)) {
					args.where = args.where ?? {};
					if (args.where.deletedAt === undefined) args.where.deletedAt = null;
				}
				return query(args);
			},
			// biome-ignore lint/suspicious/noExplicitAny: см. выше
			async delete({ model, args, query }: any) {
				if (hasSoftDelete(model))
					throw new SoftDeleteViolationError(model, "delete");
				return query(args);
			},
			// biome-ignore lint/suspicious/noExplicitAny: см. выше
			async deleteMany({ model, args, query }: any) {
				if (hasSoftDelete(model))
					throw new SoftDeleteViolationError(model, "deleteMany");
				return query(args);
			},
		},
	},
};
