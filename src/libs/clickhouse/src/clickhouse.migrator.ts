import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ClickHouseClient } from "@clickhouse/client";

/**
 * A 50-line migration runner, on purpose.
 *
 * No Node ORM models what actually matters in ClickHouse — the table ENGINE,
 * the ORDER BY key, PARTITION BY, TTL. So migrations are plain `.sql` files
 * applied in filename order, with the applied names tracked in a table.
 *
 * ClickHouse DDL is NOT transactional. One statement per file, and every
 * statement written to be idempotent (`CREATE TABLE IF NOT EXISTS`), because a
 * half-applied file cannot be rolled back — it can only be re-run.
 */
const MIGRATIONS_TABLE = "_ch_migrations";

export async function runMigrations(
	client: ClickHouseClient,
	dir: string,
	log: (msg: string) => void = console.log,
): Promise<{ applied: string[]; skipped: string[] }> {
	await client.command({
		query: `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
			name String,
			appliedAt DateTime64(3, 'UTC') DEFAULT now64(3)
		) ENGINE = MergeTree ORDER BY name`,
	});

	const rs = await client.query({
		query: `SELECT name FROM ${MIGRATIONS_TABLE}`,
		format: "JSONEachRow",
	});
	const done = new Set((await rs.json<{ name: string }>()).map((r) => r.name));

	const files = readdirSync(dir)
		.filter((f) => f.endsWith(".sql"))
		.sort();

	const applied: string[] = [];
	const skipped: string[] = [];

	for (const file of files) {
		if (done.has(file)) {
			skipped.push(file);
			continue;
		}

		const stmt = readFileSync(join(dir, file), "utf8")
			.trim()
			.replace(/;\s*$/, "");
		log(`applying ${file}`);
		await client.command({ query: stmt });
		await client.insert({
			table: MIGRATIONS_TABLE,
			values: [{ name: file }],
			format: "JSONEachRow",
		});
		applied.push(file);
	}

	return { applied, skipped };
}
