import {
	FilterFieldTypeEnum,
	FilterOperationEnum,
	SortDirectionEnum,
} from "./graphql.enum";
import { GraphqlMongooseService } from "./graphql.mongoose.service";

/**
 * Строитель запроса — то место, где строка от клиента становится условием
 * к базе. Поэтому тесты здесь не про «работает ли find», а про то, что именно
 * доходит до базы и что до неё НЕ доходит.
 */
class TestService extends GraphqlMongooseService {
	constructor(paths: string[]) {
		super();
		// Минимальный дубль модели: сервис берёт белый список из схемы.
		this.model = {
			schema: { paths: Object.fromEntries(paths.map((p) => [p, {}])) },
		} as never;
	}

	where(
		filters: Parameters<GraphqlMongooseService["buildWhere"]>[0],
		and = {},
	) {
		return this.buildWhere(filters, and);
	}
	sort(sorts: Parameters<GraphqlMongooseService["buildSort"]>[0]) {
		return this.buildSort(sorts);
	}
}

const filter = (
	columnName: string,
	operation: FilterOperationEnum,
	value: string[],
	type = FilterFieldTypeEnum.String,
) => ({ columnName, operation, type, value });

describe("GraphqlMongooseService query building", () => {
	const service = () => new TestService(["email", "name", "role", "deletedAt"]);

	// Самый дорогой сценарий: клиент выходит из скоупа и читает чужое.
	it("andWhere перекрывает фильтр клиента, а не наоборот", () => {
		const where = service().where(
			[filter("deletedAt", FilterOperationEnum.NotEqual, ["null"])],
			{ deletedAt: { $exists: false } },
		);

		expect(where.deletedAt).toEqual({ $exists: false });
	});

	it("отбрасывает колонку, которой нет в схеме", () => {
		expect(
			service().where([filter("$where", FilterOperationEnum.Equal, ["1"])]),
		).toEqual({});
	});

	it("экранирует спецсимволы в поиске по подстроке", () => {
		// Неэкранированный ввод — это регулярка, которую пишет клиент.
		// `(a+)+$` против длинного поля кладёт процессор.
		const where = service().where([
			filter("name", FilterOperationEnum.Contains, ["(a+)+$"]),
		]);

		expect(where.name).toEqual({ $regex: "\\(a\\+\\)\\+\\$", $options: "i" });
	});

	it("одно значение — равенство, несколько — $in", () => {
		expect(
			service().where([filter("role", FilterOperationEnum.Equal, ["Admin"])]),
		).toEqual({
			role: "Admin",
		});
		expect(
			service().where([
				filter("role", FilterOperationEnum.Equal, ["Admin", "Customer"]),
			]),
		).toEqual({ role: { $in: ["Admin", "Customer"] } });
	});

	it("пустая сортировка даёт детерминированный порядок", () => {
		// Без него Mongo вправе вернуть документы в любом порядке, и вторая
		// страница повторит запись с первой.
		expect(service().sort([])).toEqual({ _id: -1 });
	});

	it("сортировка по колонке вне схемы игнорируется", () => {
		expect(
			service().sort([
				{ columnName: "hacks", direction: SortDirectionEnum.Asc },
			]),
		).toEqual({ _id: -1 });
	});
});
