/**
 * Pure conversions between JS dates and ClickHouse `DateTime64(3, 'UTC')`.
 *
 * Extracted from the service for one reason: this is the conversion that fails
 * silently. ClickHouse does not reject a badly formatted timestamp — it inserts
 * the epoch. Nothing throws, nothing is logged, and the mistake surfaces weeks
 * later as a pile of events dated 1970.
 */

/** JS Date -> `YYYY-MM-DD hh:mm:ss.SSS` (UTC), the format ClickHouse expects. */
export const toClickhouseDateTime = (date: Date): string => {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
		throw new TypeError("toClickhouseDateTime: invalid Date");
	}
	// toISOString is always UTC, which is what we want — the column is declared
	// UTC. Only the separator and the trailing Z have to go.
	return date.toISOString().replace("T", " ").replace("Z", "");
};

/** `YYYY-MM-DD hh:mm:ss.SSS` (UTC) -> JS Date. */
export const fromClickhouseDateTime = (value: string): Date => {
	// The `Z` is mandatory on the way back. Without it the string is parsed in
	// the SERVER's local timezone, so the same row reads differently depending
	// on where the container runs.
	const parsed = new Date(`${value.replace(" ", "T")}Z`);
	if (Number.isNaN(parsed.getTime())) {
		throw new TypeError(`fromClickhouseDateTime: unparseable value "${value}"`);
	}
	return parsed;
};
