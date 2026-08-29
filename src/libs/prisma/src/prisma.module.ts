import { type DynamicModule, Module } from "@nestjs/common";
import type { PrismaOptions } from "./prisma.interface";
import { PrismaService } from "./prisma.service";

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic-module convention
export class PrismaModule {
	static register(options: PrismaOptions): DynamicModule {
		PrismaService._options = options;

		return {
			module: PrismaModule,
			providers: [PrismaService],
			exports: [PrismaService],
			global: true,
		};
	}
}
