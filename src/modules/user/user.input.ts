import { Field, InputType } from "@nestjs/graphql";
import {
	IsBoolean,
	IsEmail,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	MinLength,
} from "class-validator";
import { UserRoleEnum } from "./user.enum";

/**
 * Inputs are separate classes from the entity, deliberately.
 *
 * Reusing the entity as the input is the shortcut that lets a client send
 * `{ role: "Admin", isActive: true, _id: "..." }` to a create endpoint. An
 * input type lists exactly what a client may set, and the global ValidationPipe
 * rejects everything else with a 400.
 */
@InputType()
export class UserCreateInput {
	@IsEmail()
	@Field(() => String)
	email: string;

	@IsString()
	@IsNotEmpty()
	@MinLength(2)
	@MaxLength(120)
	@Field(() => String)
	name: string;

	@IsOptional()
	@IsEnum(UserRoleEnum)
	@Field(() => UserRoleEnum, { nullable: true })
	role?: UserRoleEnum;
}

@InputType()
export class UserUpdateInput {
	@IsString()
	@IsNotEmpty()
	@Field(() => String)
	id: string;

	@IsOptional()
	@IsString()
	@MinLength(2)
	@MaxLength(120)
	@Field(() => String, { nullable: true })
	name?: string;

	@IsOptional()
	@IsEnum(UserRoleEnum)
	@Field(() => UserRoleEnum, { nullable: true })
	role?: UserRoleEnum;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	isActive?: boolean;
}
