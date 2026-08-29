import { maskValue, redact } from "./redact.util";

describe("redact", () => {
	// Самый дорогой случай: секрет уехал в лог, и его надо ротировать.
	it("вырезает секреты по имени ключа, в любом регистре и написании", () => {
		expect(
			redact({
				password: "hunter2",
				Authorization: "Bearer abc",
				"x-api-key": "k",
				apiKey: "k",
				access_token: "t",
			}),
		).toEqual({
			password: "[redacted]",
			Authorization: "[redacted]",
			"x-api-key": "[redacted]",
			apiKey: "[redacted]",
			access_token: "[redacted]",
		});
	});

	it("достаёт секреты из вложенных структур и массивов", () => {
		// Секрет редко лежит на верхнем уровне — обычно он внутри payload.
		expect(
			redact({ user: { profile: { token: "t" } }, items: [{ password: "p" }] }),
		).toEqual({
			user: { profile: { token: "[redacted]" } },
			items: [{ password: "[redacted]" }],
		});
	});

	it("персональные данные маскирует частично, а не вырезает", () => {
		// Полностью скрытый email делает разбор инцидента гаданием:
		// непонятно, о ком вообще речь.
		expect(redact({ email: "alice@example.com" })).toEqual({
			email: "a***@example.com",
		});
		expect(redact({ phone: "+79001234567" })).toEqual({ phone: "+79***567" });
	});

	it("обычные поля не трогает", () => {
		expect(redact({ orderId: "o1", totalUsd: 50, ok: true })).toEqual({
			orderId: "o1",
			totalUsd: 50,
			ok: true,
		});
	});

	it("не зацикливается на циклической ссылке", () => {
		// Логгер, ушедший в бесконечность, кладёт процесс — причём в момент,
		// когда что-то уже пошло не так и лог нужен больше всего.
		const a: Record<string, unknown> = { name: "a" };
		a.self = a;

		expect(() => redact(a)).not.toThrow();
	});

	it("не ломается на null и примитивах", () => {
		expect(redact(null)).toBeNull();
		expect(redact("plain")).toBe("plain");
		expect(redact({ a: null })).toEqual({ a: null });
	});

	it("короткое значение маскируется целиком", () => {
		// Из «а***б» восстанавливается почти всё: маскировать короткое
		// частично — значит не маскировать.
		expect(maskValue("1234")).toBe("[redacted]");
	});
});
