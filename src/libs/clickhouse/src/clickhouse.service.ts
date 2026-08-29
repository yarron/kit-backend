import {
	type ClickHouseClient,
	type ClickHouseSettings,
	createClient,
} from "@clickhouse/client";
import {
	Injectable,
	Logger,
	type OnModuleDestroy,
	type OnModuleInit,
} from "@nestjs/common";
import type { ClickHouseOptions } from "./clickhouse.interface";

/**
 * Thin wrapper over the official ClickHouse client, shaped like MongooseService
 * so domain services extend it the same way.
 *
 * Two decisions worth understanding before you copy this into your own project:
 *
 * `async_insert: 1, wait_for_async_insert: 1` — ClickHouse hates many small
 * INSERTs (each one becomes a part on disk, and merging them is what eventually
 * kills the server: "too many parts"). Async insert makes the SERVER batch
 * them. Waiting for the flush keeps the write durable and immediately readable,
 * which matters because our backfill writes a checkpoint to Mongo right after,
 * and a checkpoint written for data that is not yet visible loses that data.
 *
 * `ping()` failing is NOT fatal. Analytics is a secondary store; the API must
 * still boot and serve when it is down. Decide this consciously — the opposite
 * choice (refuse to start) is also defensible, but silence is not.
 */
@Injectable()
export class ClickHouseService implements OnModuleInit, OnModuleDestroy {
	static _options: ClickHouseOptions;
	/** Shared so the typed query builder reuses ONE connection per process. */
	static sharedClient: ClickHouseClient | null = null;

	private readonly logger = new Logger(ClickHouseService.name);
	protected client: ClickHouseClient;

	constructor() {
		const { url, database, username, password } = ClickHouseService._options.db;
		this.client = createClient({
			url,
			database,
			username,
			password,
			application: "nestjs-starter-kit",
		});
		ClickHouseService.sharedClient = this.client;
	}

	async onModuleInit(): Promise<void> {
		try {
			const res = await this.client.ping();
			if (res.success === false) throw res.error;
			this.logger.log(
				`ClickHouse connected (db=${ClickHouseService._options.db.database})`,
			);
		} catch (error) {
			this.logger.error(
				`ClickHouse ping failed (non-fatal): ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	async onModuleDestroy(): Promise<void> {
		await this.client.close().catch((error) => {
			this.logger.warn(`ClickHouse close failed: ${String(error)}`);
		});
	}

	/**
	 * SELECT. Always pass values through `query_params` (`{name:Type}` in SQL) —
	 * ClickHouse has no prepared statements, so string interpolation is a real
	 * SQL injection, not a theoretical one.
	 */
	async query<T>(
		query: string,
		query_params?: Record<string, unknown>,
		settings?: ClickHouseSettings,
	): Promise<T[]> {
		if (ClickHouseService._options.db.logging) {
			this.logger.debug(`CH query: ${query}`);
		}
		const rs = await this.client.query({
			query,
			query_params,
			format: "JSONEachRow",
			clickhouse_settings: settings,
		});
		return rs.json<T>();
	}

	async insert<T>(table: string, values: T[]): Promise<void> {
		if (values.length === 0) return;
		await this.client.insert({
			table,
			values,
			format: "JSONEachRow",
			clickhouse_settings: { async_insert: 1, wait_for_async_insert: 1 },
		});
	}

	/** DDL, lightweight DELETE, OPTIMIZE — anything returning no rows. */
	async command(
		query: string,
		query_params?: Record<string, unknown>,
	): Promise<void> {
		await this.client.command({ query, query_params });
	}
}
