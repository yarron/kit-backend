import { InvoiceStatusEnum } from "./invoice.enum";

/**
 * Разрешённые переходы статуса счёта.
 *
 * Отдельной чистой функцией, потому что это правило про деньги: оплаченный
 * счёт не должен уметь вернуться в черновик, а аннулированный — в оплаченный.
 * В сервисе такое правило живёт как цепочка `if`, которую невозможно
 * протестировать целиком; здесь — как таблица, которую можно.
 */
const ALLOWED: Record<InvoiceStatusEnum, InvoiceStatusEnum[]> = {
	[InvoiceStatusEnum.Draft]: [InvoiceStatusEnum.Issued, InvoiceStatusEnum.Void],
	[InvoiceStatusEnum.Issued]: [InvoiceStatusEnum.Paid, InvoiceStatusEnum.Void],
	// Терминальные: из них выхода нет. Оплату отменяют возвратным счётом,
	// а не редактированием этого — иначе история денег переписывается задним
	// числом и сверка перестаёт сходиться.
	[InvoiceStatusEnum.Paid]: [],
	[InvoiceStatusEnum.Void]: [],
};

export const canTransition = (
	from: InvoiceStatusEnum,
	to: InvoiceStatusEnum,
): boolean => ALLOWED[from]?.includes(to) ?? false;

export const isTerminal = (status: InvoiceStatusEnum): boolean =>
	ALLOWED[status]?.length === 0;
