import { registerEnumType } from "@nestjs/graphql";

export enum SortDirectionEnum {
	Asc = "Asc",
	Desc = "Desc",
}

export enum FilterOperationEnum {
	Equal = "Equal",
	NotEqual = "NotEqual",
	Contains = "Contains",
	GreaterThanOrEqual = "GreaterThanOrEqual",
	LessThanOrEqual = "LessThanOrEqual",
	In = "In",
}

export enum FilterFieldTypeEnum {
	String = "String",
	Number = "Number",
	Boolean = "Boolean",
	Date = "Date",
}

// Code-first GraphQL does not discover enums by itself — an enum used in a
// @Field and not registered here fails at SCHEMA BUILD time, i.e. on boot.
registerEnumType(SortDirectionEnum, { name: "SortDirectionEnum" });
registerEnumType(FilterOperationEnum, { name: "FilterOperationEnum" });
registerEnumType(FilterFieldTypeEnum, { name: "FilterFieldTypeEnum" });
