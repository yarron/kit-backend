import { existsSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@clickhouse/client";
import { runMigrations } from "../src/libs/clickhouse/src/clickhouse.migrator";
import { parseClickhouseUrl } from "../src/utils/url.util";

/**
 * Apply ClickHouse migrations for one environment.
 *
 *     pnpm ch:migrate          # local
 *
 * Migrations live in per-environment folders and are PROMOTED local → dev →
 * prod, rather than one shared folder applied everywhere. The reason is that a
 * migration is not proven until it has run against real data; promoting the
 * folder is what makes "we tried it on dev first" a fact instead of a claim.
 *
 * The tracker table lives inside each database and tracks by FILENAME, so
 * identical copies across environments are safe.
 */
const VALID = ["local", "dev", "prod"] as const;
type Target = (typeof VALID)[number];

function resolveTarget(): Target {
	const raw = (process.argv[2] ?? process.env.CH_MIGRATIONS_ENV ?? "").toLowerCase();
	if (!VALID.includes(raw as Target)) {
		console.error(`Specify an environment: ${VALID.join(" | ")}`);
		process.exit(1);
	}
	return raw as Target;
}

async function main(): Promise<void> {
	const target = resolveTarget();
	const dir = join(process.cwd(), "src/libs/clickhouse/migrations", target);

	if (!existsSync(dir)) {
		console.error(`Migrations folder not found: ${dir}`);
		process.exit(1);
	}

	const { url, database, username, password } = parseClickhouseUrl(
		process.env.CLICKHOUSE_URL,
	);
	const client = createClient({ url, database, username, password });

	console.log(`ClickHouse migrate [${target}] -> ${url} db=${database}`);

	const { applied, skipped } = await runMigrations(client, dir, console.log);

	console.log(`applied: ${applied.length}, skipped: ${skipped.length}`);
	await client.close();
}

main().catch((error) => {
	console.error("migration failed:", error);
	process.exit(1);
});
