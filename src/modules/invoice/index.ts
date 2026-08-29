import { Module } from "@nestjs/common";
import { InvoiceResolver } from "./invoice.resolver";
import { InvoiceService } from "./invoice.service";

/**
 * Нет `imports` для Prisma: `PrismaModule.register()` объявлен `global: true`
 * в AppModule, поэтому `PrismaService` инжектится где угодно — так же, как
 * ClickHouse.
 */
@Module({
	providers: [InvoiceService, InvoiceResolver],
	exports: [InvoiceService],
})
export class InvoiceModule {}

export * from "./invoice.entity";
export * from "./invoice.enum";
export * from "./invoice.service";
