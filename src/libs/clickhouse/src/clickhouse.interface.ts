export interface ClickHouseOptions {
	db: {
		/** HTTP interface origin, no credentials and no path: http://host:8123 */
		url: string;
		database: string;
		username: string;
		password: string;
		/** Log every statement. Useful locally, very noisy in production. */
		logging: boolean;
	};
}
