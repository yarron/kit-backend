export interface PrismaOptions {
	db: {
		/** postgresql://user:pass@host:5432/db */
		url: string;
		/** Логировать каждый запрос. Локально полезно, в проде — шум. */
		logging: boolean;
	};
}
