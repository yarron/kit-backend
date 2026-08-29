import { MetaOutput } from "@app/graphql/graphql.output";
import { Field, ObjectType } from "@nestjs/graphql";
import { OrderEventEntity } from "./analytics.entity";

@ObjectType()
export class OrderEventsOutput {
	@Field(() => [OrderEventEntity])
	items: OrderEventEntity[];

	@Field(() => MetaOutput)
	meta: MetaOutput;
}
