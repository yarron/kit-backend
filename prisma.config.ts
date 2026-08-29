import path from "node:path";
import type { PrismaConfig } from "prisma";

/**
 * Миграции разложены ПО ОКРУЖЕНИЯМ и промоутятся local → dev → prod.
 *
 * Не один общий каталог: миграция не считается проверенной, пока не отработала
 * на реальных данных. Промоушен папки — это то, что делает фразу «мы сначала
 * прогнали на dev» фактом, а не обещанием.
 */
const env = process.env.MIGRATIONS_ENV || "local";

export default {
	schema: path.join("./prisma/schema.prisma"),
	migrations: {
		path: path.join(`./prisma/migrations/${env}`),
	},
} satisfies PrismaConfig;
