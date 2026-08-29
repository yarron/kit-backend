import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { UserEntity, UserSchema } from "./user.entity";
import { UserResolver } from "./user.resolver";
import { UserService } from "./user.service";

/**
 * `exports: [UserService]` is what lets ANOTHER module inject it. Without it
 * the provider exists but is private, and the import fails at boot with Nest's
 * "Nest can't resolve dependencies" error — which names the consumer, not the
 * missing export, and sends people hunting in the wrong file.
 */
@Module({
	imports: [
		MongooseModule.forFeature([{ name: UserEntity.name, schema: UserSchema }]),
	],
	providers: [UserService, UserResolver],
	exports: [UserService, MongooseModule],
})
export class UserModule {}

export * from "./user.entity";
export * from "./user.enum";
export * from "./user.service";
