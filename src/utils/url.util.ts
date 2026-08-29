import type { RedisOptions } from "ioredis";

/**
 * Connection-string parsers.
 *
 * One environment variable per database, in DSN form, with the database name in
 * the path — `mongodb://host:27017/starter`. The alternative (a separate
 * MONGO_HOST / MONGO_PORT / MONGO_DB triple) looks tidier and is worse: every
 * hosting provider hands you a single URL, so you end up splitting it apart at
 * deploy time and re-assembling it in code, and the two halves drift.
 */

/**
 * `redis://user:pass@host:6379/2` → ioredis options.
 *
 * The `/2` is the Redis database index and it matters: staging and production
 * often share one Redis instance, and without separate indices their BullMQ
 * queues collide — a staging worker happily eats a production job.
 */
export const parseRedisConnectionString = (
	connectionString?: string,
): RedisOptions => {
	if (!connectionString) {
		return { host: "localhost", port: 6379 };
	}

	const url = new URL(connectionString);
	const dbRaw = url.pathname.replace(/^\//, "");
	const db = dbRaw !== "" ? Number.parseInt(dbRaw, 10) : Number.NaN;

	return {
		host: url.hostname || "localhost",
		port: Number.parseInt(url.port, 10) || 6379,
		// Only set when present: ioredis treats an explicit `null` username as a
		// username, and then AUTH fails against a password-only Redis.
		...(url.username ? { username: url.username } : {}),
		...(url.password ? { password: url.password } : {}),
		...(Number.isInteger(db) ? { db } : {}),
		// The key is OMITTED for plain redis://. `tls: false` is not the same as
		// no tls — ioredis types it as connection options, and passing a boolean
		// is a type error that only shows up where the options are consumed.
		...(url.protocol === "rediss:"
			? { tls: { rejectUnauthorized: false } }
			: {}),
	};
};

/**
 * `mongodb://host:27017/starter?replicaSet=rs0` → `{ uri, dbName }`.
 *
 * Mongoose wants the database name as a separate option, not inside the URI, so
 * we split it here once instead of at every call site. Note the query string is
 * preserved and re-attached after a `/` — the MongoDB spec requires that slash
 * before options even when there is no database.
 */
export const parseMongoUrl = (
	connectionString?: string,
): { uri: string; dbName?: string } => {
	if (!connectionString) return { uri: "" };

	const beforeFragment = connectionString.split("#")[0];
	const [beforeQuery, query] = beforeFragment.split("?");

	const scheme = beforeQuery.match(/^mongodb(\+srv)?:\/\//i)?.[0] ?? "";
	const rest = beforeQuery.slice(scheme.length);
	const slashIdx = rest.indexOf("/");

	const authority = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
	const dbRaw = slashIdx === -1 ? "" : rest.slice(slashIdx + 1);

	return {
		uri: query ? `${scheme}${authority}/?${query}` : `${scheme}${authority}`,
		dbName: dbRaw ? decodeURIComponent(dbRaw) : undefined,
	};
};

export interface ClickHouseConnectionOptions {
	url: string;
	database: string;
	username: string;
	password: string;
}

/**
 * `http://user:pass@host:8123/analytics` → ClickHouse client options.
 *
 * The client wants an origin with no credentials and no path, so credentials
 * and database are lifted out of the URL rather than passed through.
 */
export const parseClickhouseUrl = (
	connectionString?: string,
): ClickHouseConnectionOptions => {
	if (!connectionString) {
		return {
			url: "http://localhost:8123",
			database: "default",
			username: "default",
			password: "",
		};
	}

	const url = new URL(connectionString);
	const database = url.pathname.replace(/^\//, "") || "default";
	const username = decodeURIComponent(url.username) || "default";
	const password = decodeURIComponent(url.password) || "";

	return {
		url: `${url.protocol}//${url.host}`,
		database,
		username,
		password,
	};
};
