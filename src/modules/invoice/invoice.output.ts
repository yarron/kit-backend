import { MetaOutput } from "@app/graphql/graphql.output";
import { Field, ObjectType } from "@nestjs/graphql";
import { InvoiceEntity } from "./invoice.entity";

@ObjectType()
export class InvoicesOutput {
	@Field(() => [InvoiceEntity])
	items: InvoiceEntity[];

	@Field(() => MetaOutput)
	meta: MetaOutput;
}
