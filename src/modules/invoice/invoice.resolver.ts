import { FilterGetInput } from "@app/graphql/graphql.input";
import { UseGuards } from "@nestjs/common";
import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { ApiKeyGuard } from "@src/guard/api-key.guard";
import { InvoiceEntity } from "./invoice.entity";
import { InvoiceCreateInput, InvoiceSetStatusInput } from "./invoice.input";
import { InvoicesOutput } from "./invoice.output";
import { InvoiceService } from "./invoice.service";

@UseGuards(ApiKeyGuard)
@Resolver(() => InvoiceEntity)
export class InvoiceResolver {
	constructor(private readonly invoiceService: InvoiceService) {}

	@Query(() => InvoicesOutput, {
		description: "Paginated invoices (PostgreSQL)",
	})
	async invoices(
		@Args("payload", { type: () => FilterGetInput }) payload: FilterGetInput,
	): Promise<InvoicesOutput> {
		return this.invoiceService.listEx<InvoicesOutput>(payload);
	}

	@Query(() => InvoiceEntity, { nullable: true })
	async invoice(@Args("id", { type: () => Int }) id: number) {
		return this.invoiceService.itemEx<InvoiceEntity>({ id });
	}

	@Mutation(() => InvoiceEntity)
	async invoiceCreate(
		@Args("payload", { type: () => InvoiceCreateInput })
		payload: InvoiceCreateInput,
	): Promise<InvoiceEntity> {
		return this.invoiceService.createInvoice(payload);
	}

	@Mutation(() => InvoiceEntity)
	async invoiceSetStatus(
		@Args("payload", { type: () => InvoiceSetStatusInput })
		payload: InvoiceSetStatusInput,
	): Promise<InvoiceEntity> {
		return this.invoiceService.setStatus(payload);
	}

	@Mutation(() => Boolean)
	async invoiceRemove(
		@Args("id", { type: () => Int }) id: number,
	): Promise<boolean> {
		return this.invoiceService.remove(id);
	}
}
