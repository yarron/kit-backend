import { Injectable } from "@nestjs/common";
import type { Model } from "mongoose";

/**
 * Thin base class over a Mongoose model. No GraphQL knowledge lives here.
 *
 * Domain services extend this and assign `this.model` in their constructor:
 *
 *     constructor(@InjectModel(UserEntity.name) model: Model<UserEntity>) {
 *         super();
 *         this.model = model;
 *     }
 *
 * Only genuinely generic operations belong here. `create` / `update` / `delete`
 * deliberately do NOT: every domain has its own rules about what a valid
 * creation is, and a generic `create(anything)` is how unvalidated payloads
 * reach the database.
 */
@Injectable()
export class MongooseService<TModel = unknown, TDocument = unknown> {
	protected model: Model<TDocument>;

	/** Page of documents plus the total count for the same filter. */
	async findMany(
		options: {
			skip?: number;
			take?: number;
			where?: Record<string, unknown>;
			sort?: Record<string, 1 | -1>;
		} = {},
	): Promise<{ items: TModel[]; total: number }> {
		const { skip = 0, take = 25, where = {}, sort = { _id: -1 } } = options;

		// Both queries in parallel: they are independent, and the round trip to
		// Mongo dominates the cost.
		const [items, total] = await Promise.all([
			this.model.find(where).sort(sort).skip(skip).limit(take).lean().exec(),
			this.model.countDocuments(where).exec(),
		]);

		return { items: items as unknown as TModel[], total };
	}

	async findById(id: string): Promise<TModel | null> {
		const item = await this.model.findById(id).lean().exec();
		return item as unknown as TModel | null;
	}

	async findOne(where: Record<string, unknown>): Promise<TModel | null> {
		const item = await this.model.findOne(where).lean().exec();
		return item as unknown as TModel | null;
	}

	async count(where: Record<string, unknown> = {}): Promise<number> {
		return this.model.countDocuments(where).exec();
	}

	/**
	 * `exists` with `.limit(1)`, not `count(...) > 0`.
	 *
	 * Counting scans every match; we only need to know whether one exists. On a
	 * collection with a million matching rows the difference is the whole query.
	 */
	async exists(where: Record<string, unknown>): Promise<boolean> {
		const found = await this.model.exists(where);
		return found !== null;
	}

	async deleteMany(
		where: Record<string, unknown>,
	): Promise<{ deletedCount: number }> {
		const result = await this.model.deleteMany(where).exec();
		return { deletedCount: result.deletedCount || 0 };
	}
}
