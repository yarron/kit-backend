import type { Type } from "@nestjs/common";
import depthLimit from "graphql-depth-limit";

const isProduction = process.env.PLATFORM_ENV === "production";

/**
 * GraphQL module options, code-first.
 *
 * `autoSchemaFile: true` means the SDL is generated from the TypeScript classes
 * at boot and kept in memory — the decorators ARE the schema. The opposite
 * (schema-first: write .graphql, generate types) means two artefacts that drift.
 *
 * `validationRules: [depthLimit(10)]` is not optional in a public API. GraphQL
 * lets a client ask for `user { orders { user { orders { … } } } }` forever;
 * without a depth limit that single request is a denial-of-service.
 */
export const graphqlFactory = (modules: Type<unknown>[]) => () => ({
	// `include` scopes the schema to these modules, so a resolver you forgot to
	// register simply is not in the schema — rather than silently exposed.
	include: modules,
	autoSchemaFile: true,
	sortSchema: true,
	path: "/gql",

	/**
	 * ⚠️ Стектрейс наружу — самая тихая утечка в этом файле.
	 *
	 * `debug` — опция Apollo Server 3, в 4/5 её нет; она молча игнорируется.
	 * Реальный ключ — `includeStacktraceInErrorResponses`, и по умолчанию он
	 * смотрит на `NODE_ENV`. Мы окружение определяем по `PLATFORM_ENV`, поэтому
	 * без явной строки ниже прод отдавал клиенту стектрейс: сообщение
	 * замаскировано в «Internal server error», а в `extensions.stacktrace`
	 * лежат пути к файлам, названия классов и версия фреймворка.
	 *
	 * Поймано боевым прогоном, а не чтением — из кода это не видно вообще.
	 */
	includeStacktraceInErrorResponses: !isProduction,
	// Introspection and the playground are a complete map of your data model.
	// Fine locally, never in production.
	playground: !isProduction,
	introspection: !isProduction,
	validationRules: [depthLimit(10)],
	context: (ctx: { req?: { headers?: Record<string, string> } }) => ({
		...ctx,
		token: ctx?.req?.headers?.authorization?.replace("Bearer ", ""),
	}),
});
