import { MongooseService } from "@libs/mongoose/src";
import { Injectable } from "@nestjs/common";
import { FilterOperationEnum, SortDirectionEnum } from "./graphql.enum";
import type { FilterGetInput, FilterInput, SortInput } from "./graphql.input";

/**
 * Turns the generic `FilterGetInput` into a Mongo query.
 *
 * This is the one place where a client-supplied string becomes a database field
 * name, so it is the one place that has to be paranoid. Everything is checked
 * against the model's own schema paths: a column the schema does not declare is
 * dropped, not passed through. Without that check, `columnName: "$where"` or a
 * filter on a field you never meant to expose walks straight into the query.
 */
@Injectable()
export class GraphqlMongooseService<
	TModel = unknown,
	TDocument = unknown,
> extends MongooseService<TModel, TDocument> {
	/** Field names the schema actually declares, plus `_id`. */
	private allowedColumns(): Set<string> {
		return new Set([...Object.keys(this.model.schema.paths), "_id"]);
	}

	async listEx<T>(
		payload: FilterGetInput,
		andWhere: Record<string, unknown> = {},
	): Promise<T> {
		const skip = payload?.paginate?.skip ?? 0;
		const take = payload?.paginate?.take ?? 25;

		const where = this.buildWhere(payload?.filters, andWhere);
		const sort = this.buildSort(payload?.sorts);

		const { items, total } = await this.findMany({ skip, take, where, sort });

		return { items, meta: { skip, take, total } } as T;
	}

	/** Single document by any subset of declared fields. */
	async itemEx<T>(
		payload: Record<string, unknown>,
		andWhere: Record<string, unknown> = {},
	): Promise<T | null> {
		const allowed = this.allowedColumns();
		const where: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(payload ?? {})) {
			if (value === undefined || value === null) continue;
			if (!allowed.has(key)) continue;
			where[key] = value;
		}

		return this.findOne({
			...where,
			...andWhere,
		}) as unknown as Promise<T | null>;
	}

	protected buildWhere(
		filters: FilterInput[] = [],
		andWhere: Record<string, unknown> = {},
	): Record<string, unknown> {
		const allowed = this.allowedColumns();
		const where: Record<string, unknown> = {};

		for (const filter of filters) {
			if (!allowed.has(filter.columnName)) continue;
			if (!filter.value?.length) continue;

			const values = filter.value.map((v) => this.cast(v, filter.type));
			const column = filter.columnName;

			switch (filter.operation) {
				case FilterOperationEnum.Equal:
					where[column] = values.length === 1 ? values[0] : { $in: values };
					break;
				case FilterOperationEnum.NotEqual:
					where[column] =
						values.length === 1 ? { $ne: values[0] } : { $nin: values };
					break;
				case FilterOperationEnum.In:
					where[column] = { $in: values };
					break;
				case FilterOperationEnum.Contains:
					// Escape the needle: an unescaped user string is a regular
					// expression, and `(a+)+$` against a long field is a CPU bomb.
					where[column] = {
						$regex: this.escapeRegex(String(values[0])),
						$options: "i",
					};
					break;
				case FilterOperationEnum.GreaterThanOrEqual:
					where[column] = { $gte: values[0] };
					break;
				case FilterOperationEnum.LessThanOrEqual:
					where[column] = { $lte: values[0] };
					break;
			}
		}

		// andWhere накладывается ПОСЛЕДНИМ и перекрывает клиентские фильтры.
		// Здесь живёт скоуп безопасности («только не удалённые», «только свои»),
		// и запрос не должен уметь из него выйти.
		return { ...where, ...andWhere };
	}

	protected buildSort(sorts: SortInput[] = []): Record<string, 1 | -1> {
		const allowed = this.allowedColumns();
		const sort: Record<string, 1 | -1> = {};

		for (const item of sorts) {
			if (!allowed.has(item.columnName)) continue;
			sort[item.columnName] = item.direction === SortDirectionEnum.Asc ? 1 : -1;
		}

		// Always fall back to a deterministic order. Without one, Mongo is free to
		// return documents in any order, and page 2 can repeat a row from page 1.
		return Object.keys(sort).length ? sort : { _id: -1 };
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

	private escapeRegex(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
}
