import { ErrorMsgEnum } from "@app/app.enum";
import { GraphqlPrismaService } from "@app/graphql/graphql.prisma.service";
import { PrismaService } from "@libs/prisma/src";
import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { round } from "@utils/money.util";
import type { InvoiceEntity } from "./invoice.entity";
import { InvoiceStatusEnum } from "./invoice.enum";
import { canTransition } from "./invoice.helpers";
import type {
	InvoiceCreateInput,
	InvoiceSetStatusInput,
} from "./invoice.input";

/**
 * Доменный сервис на Postgres. Устроен как Mongo-сервисы: наследует generic
 * список, объявляет имя модели и белый список колонок.
 *
 * `allowedColumns` НЕ включает `deletedAt` намеренно: удалённые счета
 * скрываются расширением soft-delete, и возможность отфильтровать по этой
 * колонке была бы способом их достать.
 */
@Injectable()
export class InvoiceService extends GraphqlPrismaService {
	protected modelName = "invoice";
	protected allowedColumns = [
		"id",
		"orderId",
		"status",
		"amountUsd",
		"createdAt",
	];

	// Клиент инжектится, а не наследуется: наследование дало бы этому сервису
	// СВОЙ пул соединений к Postgres. См. комментарий в GraphqlPrismaService.
	constructor(prisma: PrismaService) {
		super(prisma);
	}

	async createInvoice(input: InvoiceCreateInput): Promise<InvoiceEntity> {
		return this.prisma.db.invoice.create({
			data: {
				orderId: input.orderId,
				amountUsd: round(input.amountUsd),
				status: InvoiceStatusEnum.Draft,
			},
		});
	}

	/**
	 * Смена статуса с проверкой перехода.
	 *
	 * Читаем и пишем в ОДНОЙ транзакции: между чтением текущего статуса и
	 * записью нового два параллельных запроса иначе оба увидят `Issued` и оба
	 * переведут в `Paid` — счёт оплатится дважды. Postgres это умеет, и раз уж
	 * мы взяли SQL ради транзакций, надо ими пользоваться.
	 */
	async setStatus(input: InvoiceSetStatusInput): Promise<InvoiceEntity> {
		return this.prisma.$transaction(async (tx) => {
			const current = await tx.invoice.findUnique({ where: { id: input.id } });

			if (!current || current.deletedAt) {
				throw new NotFoundException(ErrorMsgEnum.EntityNotExist);
			}

			const from = current.status as InvoiceStatusEnum;
			if (from === input.status) return current as InvoiceEntity;

			if (!canTransition(from, input.status)) {
				throw new BadRequestException(
					`Invoice ${input.id}: ${from} → ${input.status} is not allowed`,
				);
			}

			return tx.invoice.update({
				where: { id: input.id },
				data: { status: input.status },
			}) as unknown as InvoiceEntity;
		});
	}

	/**
	 * Soft delete — ЯВНЫМ обновлением, а не `delete`.
	 *
	 * `this.db.invoice.delete()` на этой модели бросит SoftDeleteViolationError:
	 * расширение запрещает физическое удаление там, где есть `deletedAt`,
	 * вместо того чтобы молча подменить операцию.
	 */
	async remove(id: number): Promise<boolean> {
		const found = await this.prisma.db.invoice.findFirst({ where: { id } });
		if (!found) throw new NotFoundException(ErrorMsgEnum.EntityNotExist);

		await this.prisma.db.invoice.update({
			where: { id },
			data: { deletedAt: new Date() },
		});
		return true;
	}
}
