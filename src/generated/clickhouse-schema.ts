/**
 * Table shapes for the typed ClickHouse query builder.
 *
 * In a real project this file is GENERATED from the live database
 * (`@hypequery/clickhouse` introspects it) and committed, so that a column
 * renamed in a migration becomes a COMPILE error in every query that used it.
 * Here it is written by hand to keep the starter runnable without a database.
 *
 * Regenerate, do not edit, once you have a database:
 *     pnpm ch:gen-types
 */
export interface IntrospectedSchema {
	_ch_migrations: {
		name: "String";
		appliedAt: "DateTime64(3, 'UTC')";
	};
	order_event: {
		orderId: "String";
		userId: "String";
		eventType: "LowCardinality(String)";
		status: "LowCardinality(String)";
		totalUsd: "Float64";
		provider: "LowCardinality(String)";
		occurredAt: "DateTime64(3, 'UTC')";
		version: "UInt64";
	};
	v_order_daily: {
		day: "Date";
		eventType: "LowCardinality(String)";
		events: "UInt64";
		users: "UInt64";
		totalUsd: "Float64";
	};
}
