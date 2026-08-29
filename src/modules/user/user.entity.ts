import { Field, ObjectType } from "@nestjs/graphql";
import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";
import { UserRoleEnum } from "./user.enum";

/**
 * One class, two schemas.
 *
 * `@Schema`/`@Prop` describe the MONGO document; `@ObjectType`/`@Field`
 * describe the GRAPHQL type. Keeping them on the same class means a new field
 * is added in exactly one place, and a field you forget to expose is visibly
 * missing its `@Field` rather than silently absent from the API.
 *
 * The cost, and you must know it: `@Prop` without `@Field` is private to the
 * backend, but `@Field` on a sensitive column publishes it. Password hashes and
 * tokens get `@Prop` and NO `@Field`, ever.
 *
 * Every `@Prop` carries an explicit `type:`, even where the TypeScript type is
 * unambiguous. Mongoose can infer it from `emitDecoratorMetadata` — but only
 * under a compiler that emits that metadata. `tsx` and `esbuild` do not, so a
 * one-off maintenance script written with them dies at import with
 * "Cannot determine a type for the ... field". Being explicit costs six
 * characters and removes the whole class of problem.
 */
@Schema({
	collection: "users",
	// `createdAt` / `updatedAt`, maintained by Mongo. Free, and you always end
	// up wanting them.
	timestamps: true,
	// Drops `__v`. Mongoose's optimistic-locking counter is noise unless you
	// actually use `document.save()` concurrency, which this project does not.
	versionKey: false,
})
@ObjectType({ description: "Application user" })
export class UserEntity {
	@Field(() => String)
	_id: string;

	// `unique: true` creates a UNIQUE INDEX, it is not a validation rule: the
	// duplicate is rejected by the database with error code 11000, at write
	// time. Catch that code and translate it — see `user.service.ts`.
	@Prop({
		type: String,
		required: true,
		unique: true,
		index: true,
		lowercase: true,
		trim: true,
	})
	@Field(() => String)
	email: string;

	@Prop({ type: String, required: true, trim: true })
	@Field(() => String)
	name: string;

	@Prop({
		type: String,
		required: true,
		enum: Object.values(UserRoleEnum),
		default: UserRoleEnum.Customer,
	})
	@Field(() => UserRoleEnum)
	role: UserRoleEnum;

	@Prop({ type: Boolean, required: true, default: true })
	@Field(() => Boolean)
	isActive: boolean;

	// Soft delete. A hard `deleteOne` on a user with orders leaves those orders
	// pointing at nothing, and no amount of care at the call site prevents that
	// forever. Set a date instead and filter on it.
	@Prop({ type: Date, required: false })
	@Field(() => Date, { nullable: true })
	deletedAt?: Date;

	@Field(() => Date)
	createdAt: Date;

	@Field(() => Date)
	updatedAt: Date;
}

export type UserDocument = HydratedDocument<UserEntity>;
export const UserSchema = SchemaFactory.createForClass(UserEntity);
