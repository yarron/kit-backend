import { registerEnumType } from "@nestjs/graphql";

/**
 * ⚠️ Дублирует enum из `invoice.prisma`. Prisma генерирует свой тип, GraphQL
 * требует зарегистрированный — и связать их автоматически нечем.
 *
 * Расхождение НЕ поймает компилятор (значения совпадают по строке), поэтому
 * порядок такой: сначала правишь `.prisma`, потом сразу этот файл. Тест
 * `invoice.service.spec.ts` сверяет оба списка.
 */
export enum InvoiceStatusEnum {
	Draft = "Draft",
	Issued = "Issued",
	Paid = "Paid",
	Void = "Void",
}

registerEnumType(InvoiceStatusEnum, { name: "InvoiceStatusEnum" });
