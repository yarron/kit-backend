import { ErrorMsgEnum } from "@app/app.enum";
import { GraphqlMongooseService } from "@app/graphql/graphql.mongoose.service";
import {
	ConflictException,
	Injectable,
	NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { type UserDocument, UserEntity } from "./user.entity";
import type { UserCreateInput, UserUpdateInput } from "./user.input";

/** Mongo's error code for a unique-index violation. */
const DUPLICATE_KEY = 11000;

/**
 * All the business rules about users live here. The resolver only translates
 * GraphQL to method calls, and the entity only describes shape.
 *
 * That split is the whole point of the module layout: when a rule changes you
 * know it is in the service, and a service is testable without a GraphQL
 * server, an HTTP client or a container.
 */
@Injectable()
export class UserService extends GraphqlMongooseService<
	UserEntity,
	UserDocument
> {
	constructor(
		@InjectModel(UserEntity.name)
		private readonly userModel: Model<UserDocument>,
	) {
		super();
		this.model = userModel;
	}

	/**
	 * Soft-deleted users are excluded from every list. Encoding that here, once,
	 * is what keeps it true — a rule that each caller has to remember to add is
	 * a rule that is already broken somewhere.
	 */
	get activeFilter(): Record<string, unknown> {
		return { deletedAt: { $exists: false } };
	}

	async create(input: UserCreateInput): Promise<UserEntity> {
		try {
			const created = await this.userModel.create({
				email: input.email,
				name: input.name,
				...(input.role ? { role: input.role } : {}),
			});
			return created.toObject() as UserEntity;
		} catch (error) {
			// Do NOT pre-check with findOne: between the check and the insert
			// another request can create the same email, and you get the duplicate
			// anyway — just later and harder to reproduce. Let the unique index
			// decide, then translate its error.
			if ((error as { code?: number })?.code === DUPLICATE_KEY) {
				throw new ConflictException(`Email already registered: ${input.email}`);
			}
			throw error;
		}
	}

	async update(input: UserUpdateInput): Promise<UserEntity> {
		const { id, ...rest } = input;

		// Strip undefined: `{ name: undefined }` in a $set makes Mongoose write
		// null over a perfectly good value.
		const $set = Object.fromEntries(
			Object.entries(rest).filter(([, v]) => v !== undefined),
		);

		const updated = await this.userModel
			.findOneAndUpdate(
				{ _id: id, ...this.activeFilter },
				{ $set },
				{ new: true },
			)
			.lean()
			.exec();

		if (!updated) throw new NotFoundException(ErrorMsgEnum.EntityNotExist);

		return updated as UserEntity;
	}

	/** Soft delete: the row stays, everything that references it stays valid. */
	async deactivate(id: string): Promise<UserEntity> {
		const updated = await this.userModel
			.findOneAndUpdate(
				{ _id: id, ...this.activeFilter },
				{ $set: { isActive: false, deletedAt: new Date() } },
				{ new: true },
			)
			.lean()
			.exec();

		if (!updated) throw new NotFoundException(ErrorMsgEnum.EntityNotExist);

		return updated as UserEntity;
	}

	async findActiveById(id: string): Promise<UserEntity | null> {
		return this.findOne({ _id: id, ...this.activeFilter });
	}
}
