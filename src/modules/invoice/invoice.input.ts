import { Field, Float, InputType, Int } from "@nestjs/graphql";
import {
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsPositive,
	IsString,
} from "class-validator";
import { InvoiceStatusEnum } from "./invoice.enum";

@InputType()
export class InvoiceCreateInput {
	@IsString()
	@IsNotEmpty()
	@Field(() => String)
	orderId: string;

	@IsPositive()
	@Field(() => Float)
	amountUsd: number;
}

@InputType()
export class InvoiceSetStatusInput {
	@IsInt()
	@Field(() => Int)
	id: number;

	@IsEnum(InvoiceStatusEnum)
	@Field(() => InvoiceStatusEnum)
	status: InvoiceStatusEnum;

	@IsOptional()
	@IsString()
	@Field(() => String, { nullable: true })
	reason?: string;
}
