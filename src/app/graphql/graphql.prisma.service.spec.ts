import { PrismaService } from "@libs/prisma/src";
import {
	FilterFieldTypeEnum,
	FilterOperationEnum,
	SortDirectionEnum,
} from "./graphql.enum";
import { GraphqlPrismaService } from "./graphql.prisma.service";

/**
 * Тестируется ПОСТРОЕНИЕ запроса, а не сам Prisma. Строитель — это место, где
 * строка от клиента превращается в условие к базе, поэтому его и надо
 * покрывать: сам Prisma протестирован своими авторами.
 */
class TestService extends GraphqlPrismaService {
	protected modelName = "invoice";
	protected allowedColumns = [
		"id",
		"orderId",
		"status",
		"amountUsd",
		"createdAt",
	];

	where(filters: Parameters<GraphqlPrismaService["buildWhere"]>[0], and = {}) {
		return this.buildWhere(filters, and);
	}
	order(sorts: Parameters<GraphqlPrismaService["buildOrderBy"]>[0]) {
		return this.buildOrderBy(sorts);
	}
}

const filter = (
	columnName: string,
	operation: FilterOperationEnum,
	value: string[],
	type = FilterFieldTypeEnum.String,
) => ({ columnName, operation, type, value });

describe("GraphqlPrismaService query building", () => {
	let service: TestService;

	beforeEach(() => {
		PrismaService._options = {
			db: { url: "postgresql://u:p@localhost:5432/test", logging: false },
		};
		service = new TestService();
	});

	// Главное: колонка, которой нет в белом списке, НЕ доходит до базы.
	it("молча отбрасывает колонку вне белого списка", () => {
		expect(
			service.where([filter("passwordHash", FilterOperationEnum.Equal, ["x"])]),
		).toEqual({});
	});

	it("одно значение — равенство, несколько — in", () => {
		expect(
			service.where([filter("status", FilterOperationEnum.Equal, ["Paid"])]),
		).toEqual({
			status: "Paid",
		});
		expect(
			service.where([
				filter("status", FilterOperationEnum.Equal, ["Paid", "Issued"]),
			]),
		).toEqual({ status: { in: ["Paid", "Issued"] } });
	});

	it("приводит типы, а не отдаёт строки в числовое поле", () => {
		expect(
			service.where([
				filter(
					"amountUsd",
					FilterOperationEnum.GreaterThanOrEqual,
					["100"],
					FilterFieldTypeEnum.Number,
				),
			]),
		).toEqual({ amountUsd: { gte: 100 } });
	});

	it("подстрока ищется без учёта регистра", () => {
		expect(
			service.where([filter("orderId", FilterOperationEnum.Contains, ["AbC"])]),
		).toEqual({
			orderId: { contains: "AbC", mode: "insensitive" },
		});
	});

	// Самый дорогой сценарий в этом файле: клиент читает чужие данные.
	it("andWhere перекрывает фильтр клиента, а не наоборот", () => {
		// Скоуп «только свои счета» приходит из резолвера. Клиент, приславший
		// фильтр по той же колонке, не должен из него выйти.
		const where = service.where(
			[filter("orderId", FilterOperationEnum.Equal, ["someone-else"])],
			{ orderId: "mine" },
		);

		expect(where.orderId).toBe("mine");
	});

	it("пустой список сортировок даёт детерминированный порядок", () => {
		expect(service.order([])).toEqual([{ id: "desc" }]);
	});

	it("к любой сортировке добавляется хвост по id", () => {
		// Иначе строки с равным значением скачут между страницами.
		expect(
			service.order([
				{ columnName: "createdAt", direction: SortDirectionEnum.Asc },
			]),
		).toEqual([{ createdAt: "asc" }, { id: "desc" }]);
	});

	it("сортировка по чужой колонке игнорируется", () => {
		expect(
			service.order([
				{ columnName: "secret", direction: SortDirectionEnum.Asc },
			]),
		).toEqual([{ id: "desc" }]);
	});
});
