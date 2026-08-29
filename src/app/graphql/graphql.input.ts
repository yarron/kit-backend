import { Field, InputType, Int } from "@nestjs/graphql";
import { Type } from "class-transformer";
import {
	IsArray,
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	Max,
	Min,
	ValidateNested,
} from "class-validator";
import {
	FilterFieldTypeEnum,
	FilterOperationEnum,
	SortDirectionEnum,
} from "./graphql.enum";

/**
 * ONE generic list input, shared by every list query in the app.
 *
 * The alternative — a hand-written `UsersFilterInput`, `OrdersFilterInput`, … —
 * looks more type-safe and costs you a backend change every time the frontend
 * wants to sort by a new column. With this shape the frontend's table component
 * is written once and works against every collection.
 *
 * The price is that column names are runtime strings, so a service that accepts
 * them MUST validate them against a whitelist before they reach the database.
 * See `GraphqlMongooseService`.
 */

@InputType()
export class SortInput {
	@IsString()
	@IsNotEmpty()
	@Field(() => String)
	columnName: string;

	@IsEnum(SortDirectionEnum)
	@Field(() => SortDirectionEnum)
	direction: SortDirectionEnum;
}

@InputType()
export class PaginateInput {
	@IsInt()
	@Min(0)
	@Field(() => Int)
	skip: number;

	// A hard ceiling on `take`, enforced by the validation pipe. Without it, one
	// `take: 1000000` from a curious client walks your whole collection into
	// memory and takes the process down.
	@IsInt()
	@Min(1)
	@Max(200)
	@Field(() => Int)
	take: number;
}

@InputType()
export class FilterInput {
	@IsString()
	@IsNotEmpty()
	@Field(() => String)
	columnName: string;

	@IsEnum(FilterOperationEnum)
	@Field(() => FilterOperationEnum)
	operation: FilterOperationEnum;

	@IsEnum(FilterFieldTypeEnum)
	@Field(() => FilterFieldTypeEnum)
	type: FilterFieldTypeEnum;

	@IsArray()
	@IsString({ each: true })
	@Field(() => [String])
	value: string[];
}

@InputType()
export class FilterGetInput {
	@IsOptional()
	@ValidateNested()
	@Type(() => PaginateInput)
	@Field(() => PaginateInput, {
		nullable: true,
		defaultValue: { skip: 0, take: 25 },
	})
	paginate?: PaginateInput;

	@IsOptional()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => SortInput)
	@Field(() => [SortInput], { nullable: true })
	sorts?: SortInput[];

	@IsOptional()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => FilterInput)
	@Field(() => [FilterInput], { nullable: true })
	filters?: FilterInput[];
}
