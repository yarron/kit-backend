import { Field, Float, Int, ObjectType } from "@nestjs/graphql";
import { InvoiceStatusEnum } from "./invoice.enum";

/**
 * GraphQL-тип счёта. Здесь НЕТ `@Schema`/`@Prop`: таблицу описывает
 * `invoice.prisma`, а Prisma генерирует по ней типы.
 *
 * То есть в проекте две разные пары «схема + тип»:
 *   Mongo    → `@Schema` + `@ObjectType` на одном классе;
 *   Postgres → `.prisma` (таблица) + отдельный `@ObjectType` (API).
 *
 * Второй случай многословнее, и это цена SQL: у таблицы есть миграции, а у
 * документа их нет.
 */
@ObjectType({ description: "Invoice for an order (PostgreSQL)" })
export class InvoiceEntity {
	@Field(() => Int)
	id: number;

	@Field(() => String)
	orderId: string;

	@Field(() => Float)
	amountUsd: number;

	@Field(() => InvoiceStatusEnum)
	status: InvoiceStatusEnum;

	@Field(() => Date, { nullable: true })
	deletedAt?: Date | null;

	@Field(() => Date)
	createdAt: Date;

	@Field(() => Date)
	updatedAt: Date;
}
