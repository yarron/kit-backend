import { type ExecutionContext, Injectable } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { ThrottlerGuard } from "@nestjs/throttler";
import { getClientIp } from "@utils/net/client-ip";

/**
 * ThrottlerGuard, умеющий в GraphQL и считающий по ЧЕСТНОМУ адресу.
 *
 * Две правки к стандартному поведению, и обе про тихие отказы:
 *
 * 1. **Контекст.** Стандартный guard берёт `req`/`res` из HTTP-контекста,
 *    а внутри резолвера их там нет — guard молча не работает, и лимита
 *    у GraphQL-эндпоинта фактически не существует. Ничего не падает,
 *    просто ничего не ограничивается.
 *
 * 2. **Ключ.** По умолчанию ключом служит `req.ip`, который за прокси берётся
 *    из `X-Forwarded-For`. Этот заголовок клиент пишет сам: один флаг `curl`,
 *    новый адрес — и лимит обнуляется на каждом запросе. `getClientIp`
 *    читает только те заголовки, которые ставит инфраструктура.
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

	protected async getTracker(req: Record<string, unknown>): Promise<string> {
		const ip = getClientIp(req as never);
		// Пустая строка означает «адрес неизвестен» — а не «все такие запросы
		// это один клиент». Отдельное ведро, чтобы неизвестные не делили лимит
		// с реальным адресом и не выбивали друг друга.
		return ip || "unknown";
	}
}
