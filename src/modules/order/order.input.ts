import { Field, Float, InputType } from "@nestjs/graphql";
import { IsNotEmpty, IsPositive, IsString, MaxLength } from "class-validator";

@InputType()
export class OrderCreateInput {
	@IsString()
	@IsNotEmpty()
	@Field(() => String)
	userId: string;

	@IsPositive()
	@Field(() => Float)
	totalUsd: number;

	/**
	 * Supplied by the CLIENT, not generated here.
	 *
	 * A key the server generates is a new key on every retry, which defeats the
	 * whole point. The client generates it once per user intent and resends the
	 * same one — that is what makes a retry safe.
	 */
	@IsString()
	@IsNotEmpty()
	@MaxLength(128)
	@Field(() => String)
	idempotencyKey: string;
}
