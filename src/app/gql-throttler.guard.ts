import { type ExecutionContext, Injectable } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * ThrottlerGuard, умеющий в GraphQL.
 *
 * Стандартный берёт `req`/`res` из HTTP-контекста, а внутри резолвера их там
 * нет — guard молча не работает, и лимита у GraphQL-эндпоинта фактически не
 * существует. Отказ тихий: ничего не падает, просто ничего не ограничивается.
 *
 * ⚠️ Счётчик по умолчанию в ПАМЯТИ процесса. Две реплики — два независимых
 * счётчика, и реальный лимит вдвое выше заявленного. Для настоящего лимита
 * нужен общий Redis-стор.
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
	getRequestResponse(context: ExecutionContext) {
		if (context.getType<string>() === "http") {
			return super.getRequestResponse(context);
		}
		const ctx = GqlExecutionContext.create(context).getContext();
		return { req: ctx.req, res: ctx.res };
	}
}
