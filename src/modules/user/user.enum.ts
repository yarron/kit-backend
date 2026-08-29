import { registerEnumType } from "@nestjs/graphql";

export enum UserRoleEnum {
	Admin = "Admin",
	Customer = "Customer",
}

registerEnumType(UserRoleEnum, { name: "UserRoleEnum" });
