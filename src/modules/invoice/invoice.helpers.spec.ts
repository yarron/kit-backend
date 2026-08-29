import { readFileSync } from "node:fs";
import { join } from "node:path";
import { InvoiceStatusEnum } from "./invoice.enum";
import { canTransition, isTerminal } from "./invoice.helpers";

describe("переходы статуса счёта", () => {
	// Самый дорогой сценарий: деньги переписываются задним числом.
	it("из оплаченного нельзя уйти никуда", () => {
		for (const to of Object.values(InvoiceStatusEnum)) {
			expect(canTransition(InvoiceStatusEnum.Paid, to)).toBe(false);
		}
		expect(isTerminal(InvoiceStatusEnum.Paid)).toBe(true);
	});

	it("из аннулированного тоже нет выхода", () => {
		expect(canTransition(InvoiceStatusEnum.Void, InvoiceStatusEnum.Paid)).toBe(
			false,
		);
		expect(isTerminal(InvoiceStatusEnum.Void)).toBe(true);
	});

	it("нормальный путь черновик → выставлен → оплачен", () => {
		expect(
			canTransition(InvoiceStatusEnum.Draft, InvoiceStatusEnum.Issued),
		).toBe(true);
		expect(
			canTransition(InvoiceStatusEnum.Issued, InvoiceStatusEnum.Paid),
		).toBe(true);
	});

	it("через ступеньку — нельзя", () => {
		expect(canTransition(InvoiceStatusEnum.Draft, InvoiceStatusEnum.Paid)).toBe(
			false,
		);
	});

	it("мусорный статус не проходит", () => {
		expect(
			canTransition("Whatever" as InvoiceStatusEnum, InvoiceStatusEnum.Paid),
		).toBe(false);
	});
});

describe("синхронность enum'ов", () => {
	// Prisma генерирует свой enum, GraphQL требует зарегистрированный —
	// связать их автоматически нечем, и расхождение компилятор не поймает.
	// Ловим здесь: тест читает исходник схемы.
	it("TS-enum совпадает с enum в invoice.prisma", () => {
		const schema = readFileSync(join(__dirname, "invoice.prisma"), "utf-8");
		const block = schema.match(/enum\s+InvoiceStatus\s*\{([^}]*)\}/)?.[1] ?? "";
		const fromPrisma = block
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l && !l.startsWith("//"));

		expect(fromPrisma.sort()).toEqual(Object.values(InvoiceStatusEnum).sort());
	});
});
