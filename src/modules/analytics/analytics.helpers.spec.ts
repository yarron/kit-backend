import {
	fromClickhouseDateTime,
	toClickhouseDateTime,
} from "./analytics.helpers";

describe("ClickHouse datetime conversion", () => {
	const iso = "2026-08-29T13:40:10.873Z";

	it("drops the T and the Z, keeps the milliseconds", () => {
		expect(toClickhouseDateTime(new Date(iso))).toBe("2026-08-29 13:40:10.873");
	});

	it("round-trips without drift", () => {
		const date = new Date(iso);
		expect(
			fromClickhouseDateTime(toClickhouseDateTime(date)).toISOString(),
		).toBe(iso);
	});

	// The whole reason this file exists: ClickHouse does not reject a bad
	// timestamp, it stores the epoch. So the guard has to be on OUR side.
	it("throws on an invalid Date instead of writing garbage", () => {
		expect(() => toClickhouseDateTime(new Date("nonsense"))).toThrow(TypeError);
		expect(() => toClickhouseDateTime(undefined as never)).toThrow(TypeError);
	});

	it("throws on an unparseable value coming back", () => {
		expect(() => fromClickhouseDateTime("not a date")).toThrow(TypeError);
	});

	it("reads a stored value as UTC regardless of the server timezone", () => {
		// Without the appended Z this is parsed as local time, and the same row
		// reads differently in a container running outside UTC.
		expect(
			fromClickhouseDateTime("2026-01-01 00:00:00.000").toISOString(),
		).toBe("2026-01-01T00:00:00.000Z");
	});
});
