/**
 * Пины боевого режима.
 *
 * Каждое из этих утверждений уже один раз оказалось неверным на живом
 * прогоне, и ни одно из них не видно при чтении кода: `debug: false`
 * выглядел как «стектрейсы выключены», а на самом деле опция от Apollo 3
 * и в 4/5 молча игнорируется.
 *
 * Модуль читает `PLATFORM_ENV` при импорте, поэтому окружение выставляется
 * ДО require и модуль каждый раз загружается заново.
 */
const loadFactory = (env: string) => {
	jest.resetModules();
	process.env.PLATFORM_ENV = env;
	// biome-ignore lint/complexity/useLiteralKeys: динамический импорт после подмены env
	return require("./graphql.utils").graphqlFactory;
};

describe("настройки GraphQL", () => {
	const original = process.env.PLATFORM_ENV;
	afterAll(() => {
		process.env.PLATFORM_ENV = original;
	});

	describe("production", () => {
		const options = () => loadFactory("production")([])();

		it("не отдаёт стектрейс клиенту", () => {
			// Стектрейс называет пути к файлам, классы и версию фреймворка.
			expect(options().includeStacktraceInErrorResponses).toBe(false);
		});

		it("выключает интроспекцию", () => {
			// Интроспекция — полная карта модели данных.
			expect(options().introspection).toBe(false);
		});

		it("выключает песочницу", () => {
			expect(options().playground).toBe(false);
		});

		it("держит ограничение глубины включённым", () => {
			// Ограничение глубины нужно именно в проде, а не только локально.
			expect(options().validationRules).toHaveLength(1);
		});
	});

	describe("не production", () => {
		const options = () => loadFactory("local")([])();

		it("оставляет песочницу и интроспекцию — они нужны для работы", () => {
			expect(options().introspection).toBe(true);
			expect(options().playground).toBe(true);
		});

		it("показывает стектрейс: локально он полезен", () => {
			expect(options().includeStacktraceInErrorResponses).toBe(true);
		});
	});
});
