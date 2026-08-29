import { FilterGetInput } from "@app/graphql/graphql.input";
import { UseGuards } from "@nestjs/common";
import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { ApiKeyGuard } from "@src/guard/api-key.guard";
import { UserEntity } from "./user.entity";
import { UserCreateInput, UserUpdateInput } from "./user.input";
import { UsersOutput } from "./user.output";
import { UserService } from "./user.service";

/**
 * The resolver is a thin translation layer: arguments in, service call out.
 * No `if` about business rules, no database access, no formatting.
 *
 * Keeping it thin is what makes the service unit-testable and what stops the
 * same rule from being implemented slightly differently in the REST controller,
 * the queue processor and the admin script.
 */
@UseGuards(ApiKeyGuard)
@Resolver(() => UserEntity)
export class UserResolver {
	constructor(private readonly userService: UserService) {}

	@Query(() => UsersOutput, { description: "Paginated list of users" })
	async users(
		@Args("payload", { type: () => FilterGetInput }) payload: FilterGetInput,
	): Promise<UsersOutput> {
		return this.userService.listEx<UsersOutput>(
			payload,
			this.userService.activeFilter,
		);
	}

	@Query(() => UserEntity, { nullable: true, description: "User by id" })
	async user(@Args("id", { type: () => String }) id: string) {
		return this.userService.findActiveById(id);
	}

	@Mutation(() => UserEntity, { description: "Create a user" })
	async userCreate(
		@Args("payload", { type: () => UserCreateInput }) payload: UserCreateInput,
	): Promise<UserEntity> {
		return this.userService.create(payload);
	}

	@Mutation(() => UserEntity, { description: "Update a user" })
	async userUpdate(
		@Args("payload", { type: () => UserUpdateInput }) payload: UserUpdateInput,
	): Promise<UserEntity> {
		return this.userService.update(payload);
	}

	@Mutation(() => UserEntity, { description: "Soft-delete a user" })
	async userDeactivate(
		@Args("id", { type: () => String }) id: string,
	): Promise<UserEntity> {
		return this.userService.deactivate(id);
	}
}
