import { QueueName } from "@app/app.enum";
import { AnalyticsModule } from "@modules/analytics";
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { OrderEntity, OrderSchema } from "./order.entity";
import { OrderQueue } from "./order.queue";
import { OrderResolver } from "./order.resolver";
import { OrderService } from "./order.service";
import { PaymentProviderService } from "./payment-provider.service";
import { MaintenanceProcessor } from "./processors/maintenance.processor";
import { OrderProcessor } from "./processors/order.processor";

/**
 * `BullModule.registerQueue` here as well as in AppModule is not a duplicate:
 * AppModule registers every queue so BullBoard can see them, this one makes
 * `@InjectQueue` resolvable INSIDE this module. Registering is idempotent.
 */
@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: OrderEntity.name, schema: OrderSchema },
		]),
		// `forceDisconnectOnShutdown` — see the comment in app/index.ts.
		BullModule.registerQueue({
			name: QueueName.ORDER,
			forceDisconnectOnShutdown: true,
		}),
		BullModule.registerQueue({
			name: QueueName.MAINTENANCE,
			forceDisconnectOnShutdown: true,
		}),
		AnalyticsModule,
	],
	providers: [
		OrderService,
		OrderQueue,
		OrderResolver,
		PaymentProviderService,
		OrderProcessor,
		MaintenanceProcessor,
	],
	exports: [OrderService, OrderQueue],
})
export class OrderModule {}

export * from "./order.entity";
export * from "./order.enum";
export * from "./order.service";
