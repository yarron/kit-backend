import { OrderEntity } from "@modules/order";
import { getConnectionToken, getModelToken } from "@nestjs/mongoose";
import { Test } from "@nestjs/testing";
import { AppModule } from "@src/app";
import { MONGO_MODELS, syncAllIndexes } from "@src/app/mongo-indexes";
import type { Connection, Model } from "mongoose";

/**
 * The most expensive scenario in this codebase, tested against a real Mongo.
 *
 * `idempotencyKey` is unique, and that word is not a validation rule — it is a
 * UNIQUE INDEX. Turn index creation off on boot (we do, deliberately) and
 * forget to apply the indexes, and the constraint is simply absent: the second
 * insert of the same key succeeds and the customer is charged twice. Nothing
 * errors, nothing is logged.
 *
 * So the first test proves the danger is real and the second proves the apply
 * step removes it. Without the first one the second proves only that Mongo can
 * create an index.
 */
describe("Order indexes (e2e)", () => {
	let connection: Connection;
	let model: Model<OrderEntity>;
	let close: () => Promise<void>;

	const order = () => ({
		userId: "u-1",
		status: "Pending",
		totalUsd: 10,
		idempotencyKey: "same-key",
	});

	/** Leave `_id_`: Mongo creates it itself and refuses to drop it. */
	const dropDeclaredIndexes = async () => {
		await model.createCollection().catch((error: { code?: number }) => {
			// 48 = NamespaceExists. Anything else is a real failure and must not
			// be swallowed — a silently missing collection would make the first
			// test pass for the wrong reason.
			if (error?.code !== 48) throw error;
		});
		await model.collection.dropIndexes();
	};

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();
		const app = moduleRef.createNestApplication();
		await app.init();
		close = () => app.close();
		connection = moduleRef.get<Connection>(getConnectionToken());
		model = moduleRef.get<Model<OrderEntity>>(getModelToken(OrderEntity.name));
	});

	afterAll(async () => {
		await close?.();
	});

	beforeEach(async () => {
		await model.deleteMany({});
	});

	it("without the apply step the unique key is not enforced — the same key inserts twice", async () => {
		await dropDeclaredIndexes();

		await model.create(order());
		await expect(model.create(order())).resolves.toBeDefined();

		const names = (await model.collection.listIndexes().toArray()).map(
			(i) => i.name,
		);
		expect(names).toEqual(["_id_"]);
	});

	it("after syncAllIndexes the duplicate is rejected by the database", async () => {
		await dropDeclaredIndexes();
		await syncAllIndexes(connection);

		await model.create(order());
		await expect(model.create(order())).rejects.toThrow(/E11000/);
	});

	it("applies the compound index the flush query relies on", async () => {
		await dropDeclaredIndexes();
		await syncAllIndexes(connection);

		const names = (await model.collection.listIndexes().toArray()).map(
			(i) => i.name,
		);
		expect(names).toContain("status_1_createdAt_1");
	});

	it("applies every model the application registered", async () => {
		const applied = await syncAllIndexes(connection);
		expect(applied.map((r) => r.model).sort()).toEqual(
			Object.keys(connection.models).sort(),
		);
	});

	it("the script's model list has not drifted from the application", () => {
		// `pnpm db:indexes` cannot boot Nest (esbuild emits no decorator
		// metadata), so it carries its own list. This is what stops that list
		// from going stale silently: add a model, forget the list, fail here —
		// instead of discovering a missing unique index in production.
		expect(MONGO_MODELS.map((m) => m.name).sort()).toEqual(
			Object.keys(connection.models).sort(),
		);
	});
});
