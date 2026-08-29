import { MetaOutput } from "@app/graphql/graphql.output";
import { Field, ObjectType } from "@nestjs/graphql";
import { UserEntity } from "./user.entity";

@ObjectType()
export class UsersOutput {
	@Field(() => [UserEntity])
	items: UserEntity[];

	@Field(() => MetaOutput)
	meta: MetaOutput;
}
