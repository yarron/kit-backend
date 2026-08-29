import { MetaOutput } from "@app/graphql/graphql.output";
import { Field, ObjectType } from "@nestjs/graphql";
import { OrderEntity } from "./order.entity";

@ObjectType()
export class OrdersOutput {
	@Field(() => [OrderEntity])
	items: OrderEntity[];

	@Field(() => MetaOutput)
	meta: MetaOutput;
}
