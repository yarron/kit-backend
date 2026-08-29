import {
	parseClickhouseUrl,
	parseMongoUrl,
	parseRedisConnectionString,
} from "./url.util";

describe("parseMongoUrl", () => {
	it("splits the database name out of the path", () => {
		expect(parseMongoUrl("mongodb://localhost:27017/starter")).toEqual({
			uri: "mongodb://localhost:27017",
			dbName: "starter",
		});
	});

	it("keeps query options and re-attaches the required slash", () => {
		// The MongoDB spec requires a "/" before "?" even with no database.
		// Dropping it produces a URI the driver rejects at connect time — i.e.
		// on boot, in production, not here.
		expect(
			parseMongoUrl("mongodb://a:b@h1:27017,h2:27017/db?replicaSet=rs0"),
		).toEqual({
			uri: "mongodb://a:b@h1:27017,h2:27017/?replicaSet=rs0",
			dbName: "db",
		});
	});

	it("handles a URL with no database at all", () => {
		expect(parseMongoUrl("mongodb://localhost:27017")).toEqual({
			uri: "mongodb://localhost:27017",
			dbName: undefined,
		});
	});

	it("supports mongodb+srv", () => {
		expect(
			parseMongoUrl("mongodb+srv://user:pw@cluster.example.net/prod").dbName,
		).toBe("prod");
	});

	it("returns an empty uri rather than throwing on undefined", () => {
		expect(parseMongoUrl(undefined)).toEqual({ uri: "" });
	});
});

describe("parseRedisConnectionString", () => {
	it("reads the database index from the path", () => {
		// This is what keeps staging and production queues apart on one Redis.
		expect(parseRedisConnectionString("redis://localhost:6379/2").db).toBe(2);
	});

	it("omits db when the path is empty (ioredis then defaults to 0)", () => {
		expect(
			parseRedisConnectionString("redis://localhost:6379"),
		).not.toHaveProperty("db");
	});

	it("sets tls only for rediss:// and omits the key otherwise", () => {
		expect(parseRedisConnectionString("rediss://h:6379").tls).toEqual({
			rejectUnauthorized: false,
		});
		// Omitted, not `false`: ioredis types `tls` as connection options, so a
		// boolean there is a type error at every place the options are consumed.
		expect(parseRedisConnectionString("redis://h:6379")).not.toHaveProperty(
			"tls",
		);
	});

	it("falls back to localhost when nothing is configured", () => {
		expect(parseRedisConnectionString(undefined).host).toBe("localhost");
	});
});

describe("parseClickhouseUrl", () => {
	it("lifts credentials and database out of the URL", () => {
		expect(
			parseClickhouseUrl("http://user:pw@ch.example:8123/analytics"),
		).toEqual({
			url: "http://ch.example:8123",
			database: "analytics",
			username: "user",
			password: "pw",
		});
	});

	it("decodes percent-encoded credentials", () => {
		// Generated passwords contain "@" and "/", which must be encoded in the
		// URL and decoded here — otherwise auth fails with a wrong password that
		// looks correct in the logs.
		expect(
			parseClickhouseUrl("https://u:p%40ss%2Fword@h:8443/db").password,
		).toBe("p@ss/word");
	});
});
