import { PrismaService } from "@libs/prisma/src";
import { Injectable } from "@nestjs/common";
import { FilterOperationEnum, SortDirectionEnum } from "./graphql.enum";
import type { FilterGetInput, FilterInput, SortInput } from "./graphql.input";

/**
 * Тот же generic-список, что у Mongo, но поверх Prisma.
 *
 * Форма `FilterGetInput` НАМЕРЕННО одна на оба хранилища: фронт не должен
 * знать, где лежит коллекция, и таблица на нём остаётся одной и той же.
 * Разъезжающиеся входные типы для Mongo и Postgres — это два компонента
 * таблицы на фронте вместо одного.
 *
 * Как и в Mongo-версии, имена колонок приходят строками, поэтому сверяются
 * с белым списком, который задаёт доменный сервис. Prisma не выполнит запрос
 * по несуществующему полю (упадёт), но список нужен не для этого: он не даёт
 * фильтровать по полям, которые ты не собирался показывать.
 */
@Injectable()
export class GraphqlPrismaService {
	/** Имя делегата Prisma: "invoice" → prisma.db.invoice. Задаёт наследник. */
	protected modelName = "";

	/** Поля, по которым клиенту РАЗРЕШЕНО фильтровать и сортировать. */
	protected allowedColumns: string[] = [];

	/**
	 * ⚠️ Клиент приходит ЧЕРЕЗ КОНСТРУКТОР, а не наследованием.
	 *
	 * Соблазн написать `extends PrismaService` велик — с Mongo так и сделано,
	 * и выглядит симметрично. Но `PrismaService` САМ является `PrismaClient`:
	 * унаследовавший его сервис — это ВТОРОЙ клиент со своим пулом соединений
	 * и своим `$connect()`. Пять доменных сервисов = пять пулов по 10 коннектов,
	 * а у Postgres их всего сотня на всех.
	 *
	 * Поймано в логе: «Postgres connected» печаталось дважды.
	 */
	constructor(protected readonly prisma: PrismaService) {}

	private get delegate() {
		// Через `db` — то есть через клиент С расширениями. Обращение к
		// `prisma[modelName]` напрямую обошло бы soft-delete.
		return this.prisma.db[this.modelName];
	}

	private isAllowed(column: string): boolean {
		return this.allowedColumns.includes(column);
	}

	async listEx<T>(
		payload: FilterGetInput,
		andWhere: Record<string, unknown> = {},
	): Promise<T> {
		const skip = payload?.paginate?.skip ?? 0;
		const take = payload?.paginate?.take ?? 25;

		const where = this.buildWhere(payload?.filters, andWhere);
		const orderBy = this.buildOrderBy(payload?.sorts);

		const [items, total] = await Promise.all([
			this.delegate.findMany({ skip, take, where, orderBy }),
			this.delegate.count({ where }),
		]);

		return { items, meta: { skip, take, total } } as T;
	}

	async itemEx<T>(
		payload: Record<string, unknown>,
		andWhere: Record<string, unknown> = {},
	): Promise<T | null> {
		const where: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(payload ?? {})) {
			if (value === undefined || value === null) continue;
			if (!this.isAllowed(key)) continue;
			where[key] = value;
		}

		Object.assign(where, andWhere);

		// findFirst, а не findUnique: where здесь собирается динамически и может
		// не быть уникальным ключом, а findUnique такой аргумент отвергает.
		return this.delegate.findFirst({ where }) as Promise<T | null>;
	}

	protected buildWhere(
		filters: FilterInput[] = [],
		andWhere: Record<string, unknown> = {},
	): Record<string, unknown> {
		const where: Record<string, unknown> = {};

		for (const filter of filters) {
			if (!this.isAllowed(filter.columnName)) continue;
			if (!filter.value?.length) continue;

			const values = filter.value.map((v) => this.cast(v, filter.type));
			const column = filter.columnName;

			switch (filter.operation) {
				case FilterOperationEnum.Equal:
					where[column] = values.length === 1 ? values[0] : { in: values };
					break;
				case FilterOperationEnum.NotEqual:
					where[column] =
						values.length === 1 ? { not: values[0] } : { notIn: values };
					break;
				case FilterOperationEnum.In:
					where[column] = { in: values };
					break;
				case FilterOperationEnum.Contains:
					// `mode: "insensitive"` — это Postgres ILIKE. Экранировать ввод
					// не нужно: Prisma параметризует значение, а не склеивает SQL.
					where[column] = { contains: String(values[0]), mode: "insensitive" };
					break;
				case FilterOperationEnum.GreaterThanOrEqual:
					where[column] = { gte: values[0] };
					break;
				case FilterOperationEnum.LessThanOrEqual:
					where[column] = { lte: values[0] };
					break;
			}
		}

		// andWhere накладывается ПОСЛЕДНИМ и перекрывает всё, что прислал клиент.
		// Здесь живёт скоуп безопасности («только свои счета»), и фильтр из
		// запроса не должен уметь из него выйти. Обратный порядок — обычная
		// дыра: клиент присылает фильтр по той же колонке и читает чужое.
		return { ...where, ...andWhere };
	}

	protected buildOrderBy(
		sorts: SortInput[] = [],
	): Record<string, "asc" | "desc">[] {
		const orderBy = sorts
			.filter((s) => this.isAllowed(s.columnName))
			.map((s) => ({
				[s.columnName]: s.direction === SortDirectionEnum.Asc ? "asc" : "desc",
			})) as Record<string, "asc" | "desc">[];

		// Детерминированный хвост обязателен: без него две строки с одинаковым
		// значением сортировки могут менять порядок между страницами, и вторая
		// страница повторит запись с первой.
		return orderBy.length ? [...orderBy, { id: "desc" }] : [{ id: "desc" }];
	}

	private cast(value: string, type: string): unknown {
		switch (type) {
			case "Number": {
				const n = Number(value);
				return Number.isFinite(n) ? n : value;
			}
			case "Boolean":
				return value === "true";
			case "Date": {
				const d = new Date(value);
				return Number.isNaN(d.getTime()) ? value : d;
			}
			default:
				return value;
		}
	}
}
