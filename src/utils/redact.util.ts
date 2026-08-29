/**
 * Вычистить из объекта то, чего не должно быть в логах.
 *
 * Правило простое и невесёлое: **лог живёт дольше и путешествует дальше,
 * чем ты думаешь.** Он уезжает в агрегатор, в Sentry, в скриншот в чате,
 * в тикет поддержки. Попавший туда токен придётся ротировать, а попавшие
 * персональные данные — объяснять.
 *
 * Чистая функция: обходит структуру и заменяет значения по ИМЕНИ ключа,
 * а не по содержимому. Угадывать «похоже ли это на токен» бессмысленно —
 * ключ известен заранее, содержимое нет.
 */

/** Ключи, значение которых не выводится никогда. Сравнение регистронезависимое. */
const SECRET_KEYS = [
	"password",
	"pass",
	"secret",
	"token",
	"accesstoken",
	"refreshtoken",
	"authorization",
	"apikey",
	"x-api-key",
	"x-service-token",
	"cookie",
	"setcookie",
	"privatekey",
	"clientsecret",
	"idempotencykey",
];

/**
 * Ключи с персональными данными: показываем ЧАСТИЧНО.
 *
 * Полностью скрыть тоже плохо — по логу становится невозможно понять,
 * о ком речь, и разбор инцидента превращается в гадание. Компромисс:
 * достаточно, чтобы узнать запись, недостаточно, чтобы её использовать.
 */
const PII_KEYS = ["email", "phone", "iban", "card", "cardnumber"];

const REDACTED = "[redacted]";

/** `alice@example.com` → `a***@example.com`; `+79001234567` → `+7900***567`. */
export function maskValue(value: string): string {
	if (value.includes("@")) {
		const [name, domain] = value.split("@");
		return `${name.slice(0, 1)}***@${domain}`;
	}
	if (value.length <= 4) return REDACTED;
	return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

const norm = (key: string): string => key.toLowerCase().replace(/[-_]/g, "");

/**
 * Списки нормализуются ТОЖЕ.
 *
 * Первая версия сравнивала нормализованный ключ (`xapikey`) с сырым списком
 * (`"x-api-key"`) — и заголовок `x-api-key` проходил в лог как есть. Тест
 * поймал сразу; без него это утекало бы ровно до первого разбора инцидента,
 * то есть до момента, когда лог кто-нибудь наконец прочитает.
 */
const SECRETS = new Set(SECRET_KEYS.map(norm));
const PII = new Set(PII_KEYS.map(norm));

export function redact<T>(input: T, depth = 0): T {
	// Ограничение глубины — защита от циклических ссылок и от гигантских
	// структур: лог не должен уметь съесть память или зациклиться.
	if (depth > 6) return REDACTED as unknown as T;

	if (Array.isArray(input)) {
		return input.map((item) => redact(item, depth + 1)) as unknown as T;
	}

	if (input === null || typeof input !== "object") return input;

	const source = input as Record<string, unknown>;
	const result: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(source)) {
		const k = norm(key);

		if (SECRETS.has(k)) {
			result[key] = REDACTED;
			continue;
		}

		if (PII.has(k) && typeof value === "string") {
			result[key] = maskValue(value);
			continue;
		}

		result[key] =
			typeof value === "object" && value !== null
				? redact(value, depth + 1)
				: value;
	}

	return result as unknown as T;
}
