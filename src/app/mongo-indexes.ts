import { OrderEntity, OrderSchema } from "@modules/order/order.entity";
import { UserEntity, UserSchema } from "@modules/user/user.entity";
import type { Connection, ConnectOptions, Schema } from "mongoose";

/**
 * Every Mongo model in the application.
 *
 * `pnpm db:indexes` needs the schemas without booting Nest — esbuild does not
 * emit decorator metadata, so a script cannot resolve the container's
 * dependencies by type. Hence a list.
 *
 * A list maintained by hand goes stale on the first new model, and the failure
 * is silent: the index simply never appears. This one cannot go stale quietly —
 * order-indexes.e2e-spec.ts asserts it matches the models the running
 * application actually registered, so a forgotten entry fails the suite instead
 * of skipping an index in production.
 */
export const MONGO_MODELS: Array<{ name: string; schema: Schema }> = [
	{ name: OrderEntity.name, schema: OrderSchema },
	{ name: UserEntity.name, schema: UserSchema },
];

export type MongoConnectionSettings = {
	dbName: string;
};

/**
 * Connection options for the single Mongoose connection.
 *
 * They live here rather than inline in the module so the one setting that has
 * teeth — `autoIndex` — can be asserted by a test instead of being read off a
 * line nobody opens.
 */
export function mongoConnectionOptions(
	settings: MongoConnectionSettings,
): ConnectOptions & { autoIndex: boolean; maxPoolSize: number } {
	return {
		dbName: settings.dbName,

		// Mongoose creates every declared index on boot by default. On a large
		// collection that is a heavy operation running exactly while a deploy is
		// rolling, so indexes are applied deliberately by `pnpm db:indexes`.
		//
		// Off in EVERY environment, not only production. A protection the test
		// environment switches off is a protection nobody exercises: it would
		// sit in production looking healthy, and the apply path would first be
		// tried on live data.
		//
		// ⚠️ The other half of this decision is that a fresh database has no
		// unique indexes until the apply step runs — and `unique` is a UNIQUE
		// INDEX, not a validation rule. Skip the step and duplicate
		// idempotency keys insert silently. See order-indexes.e2e-spec.ts.
		autoIndex: false,

		// Pool size is per PROCESS, not per request. Too small and requests
		// queue behind each other under load; too large and you exhaust the
		// server's connection limit with a few containers.
		maxPoolSize: 20,
	};
}

export type IndexSyncResult = {
	model: string;
	created: string[];
	dropped: string[];
};

/**
 * Apply every index the schemas declare.
 *
 * The models are read from the connection, not listed here: a list maintained
 * by hand goes stale on the first new model, and the failure is silent — the
 * index simply never appears.
 *
 * ⚠️ `syncIndexes` also DROPS indexes that are on the collection but not in the
 * schema. That is the intended behaviour — the schema is the source of truth,
 * and a dead index still costs a write on every insert — but it means an index
 * someone added by hand in the database will disappear here. Dropped names are
 * returned so the caller can print them instead of doing it quietly.
 */
export async function syncAllIndexes(
	connection: Connection,
): Promise<IndexSyncResult[]> {
	const results: IndexSyncResult[] = [];

	for (const name of Object.keys(connection.models)) {
		const model = connection.models[name];
		const dropped = await model.syncIndexes();
		const created = (await model.collection.listIndexes().toArray()).map(
			(index) => index.name as string,
		);
		results.push({ model: name, created, dropped });
	}

	return results;
}
