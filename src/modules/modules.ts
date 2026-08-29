import { CONFIG } from "@src/config";
import { AnalyticsModule } from "./analytics";
import { InvoiceModule } from "./invoice";
import { OrderModule } from "./order";
import { UserModule } from "./user";

/**
 * The list AppModule imports, and the list the GraphQL schema is built from.
 *
 * A resolver in a module that is not here simply does not exist in the schema —
 * which is the desired failure mode. The opposite (auto-discovering every
 * resolver in the folder) means a half-finished module ships to production the
 * moment someone creates the file.
 */
export const modules = [
	UserModule,
	OrderModule,
	AnalyticsModule,
	// Модуль на Postgres появляется в схеме только вместе со слоем Prisma.
	// Резолвер без базы отвечал бы 500 на каждый запрос — лучше, чтобы поля
	// в схеме просто не было.
	...(CONFIG.postgres.url ? [InvoiceModule] : []),
];
