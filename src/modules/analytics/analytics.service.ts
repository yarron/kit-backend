import { ClickHouseService } from "@libs/clickhouse/src";
import { Injectable, Logger } from "@nestjs/common";
import type { DailyStatEntity, OrderEventEntity } from "./analytics.entity";
import {
	fromClickhouseDateTime,
	toClickhouseDateTime,
} from "./analytics.helpers";

export interface OrderEventInput {
	orderId: string;
	userId: string;
	eventType: string;
	status: string;
	totalUsd: number;
	provider: string;
	occurredAt: Date;
}

interface OrderEventRow {
	orderId: string;
	userId: string;
	eventType: string;
	status: string;
	totalUsd: number;
	provider: string;
	occurredAt: string;
}

/**
 * The analytics store, injected rather than inherited.
 *
 * `ClickHouseService` is a global singleton holding ONE client. Extending it
 * (the way domain services extend `MongooseService`) would give every analytics
 * service its own connection — fine with Mongo's driver, wasteful here.
 *
 * ClickHouse is the third database in this project and it is here for one
 * reason: append-only, high-volume rows that are read as aggregates. Mongo can
 * store them, but `sum()` over ten million documents is a slow scan, while for
 * ClickHouse it is the only thing it does. The rule of thumb: current STATE
 * goes to Mongo or Postgres, immutable HISTORY goes to ClickHouse.
 */
@Injectable()
export class AnalyticsService {
	private readonly logger = new Logger(AnalyticsService.name);

	constructor(private readonly clickhouse: ClickHouseService) {}

	/**
	 * Append one event.
	 *
	 * `version: Date.now()` is what ReplacingMergeTree uses to decide which
	 * duplicate wins. Re-ingesting the same event is therefore harmless, which
	 * is exactly what you need when a job is re-delivered.
	 *
	 * A failure here is logged and swallowed on purpose: analytics must never
	 * fail a customer's order. That is a decision with a cost — a ClickHouse
	 * outage silently loses events — so the log line is the alert.
	 */
	async recordOrderEvent(event: OrderEventInput): Promise<void> {
		try {
			await this.clickhouse.insert("order_event", [
				{
					orderId: event.orderId,
					userId: event.userId,
					eventType: event.eventType,
					status: event.status,
					totalUsd: event.totalUsd,
					provider: event.provider,
					// See analytics.helpers: getting this format wrong inserts the
					// epoch, and nothing complains.
					occurredAt: toClickhouseDateTime(event.occurredAt),
					version: Date.now(),
				},
			]);
		} catch (error) {
			this.logger.error(
				`recordOrderEvent failed for ${event.orderId}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	/**
	 * Daily aggregate for one day.
	 *
	 * Values go through `query_params`, never string interpolation. ClickHouse
	 * has no prepared statements, so a template literal here is a live SQL
	 * injection — and `day` comes from a job payload, which comes from an API.
	 */
	async dailySummary(day: string): Promise<DailyStatEntity[]> {
		const rows = await this.clickhouse.query<{
			day: string;
			eventType: string;
			events: string;
			users: string;
			totalUsd: number;
		}>(
			`SELECT day, eventType, events, users, totalUsd
			 FROM v_order_daily
			 WHERE day = {day:Date}
			 ORDER BY eventType`,
			{ day },
		);

		// Counts come back as STRINGS: ClickHouse UInt64 exceeds what a JS number
		// can hold exactly, so the client refuses to guess. Convert explicitly.
		return rows.map((r) => ({
			day: r.day,
			eventType: r.eventType,
			events: Number(r.events),
			users: Number(r.users),
			totalUsd: Number(r.totalUsd),
		}));
	}

	/**
	 * Recent events for one order.
	 *
	 * `FINAL` is not optional on a ReplacingMergeTree. Deduplication happens
	 * during background merges, on ClickHouse's own schedule — without FINAL a
	 * re-ingested event is returned twice, and the bug appears only under the
	 * load that makes merges fall behind. It costs performance; that is the
	 * trade you accept for the engine.
	 */
	async findOrderEvents(
		orderId: string,
		limit = 50,
	): Promise<OrderEventEntity[]> {
		const rows = await this.clickhouse.query<OrderEventRow>(
			`SELECT orderId, userId, eventType, status, totalUsd, provider, occurredAt
			 FROM order_event FINAL
			 WHERE orderId = {orderId:String}
			 ORDER BY occurredAt DESC
			 LIMIT {limit:UInt32}`,
			{ orderId, limit },
			// Per-query safety net. An analytics query that runs for ten minutes
			// takes memory from everything else on the server.
			{ max_execution_time: 30 },
		);

		return rows.map((r) => this.toEntity(r));
	}

	private toEntity(row: OrderEventRow): OrderEventEntity {
		return {
			_id: `${row.orderId}_${row.eventType}_${row.occurredAt}`,
			orderId: row.orderId,
			userId: row.userId,
			eventType: row.eventType,
			status: row.status,
			totalUsd: Number(row.totalUsd),
			provider: row.provider,
			occurredAt: fromClickhouseDateTime(row.occurredAt),
		};
	}
}
