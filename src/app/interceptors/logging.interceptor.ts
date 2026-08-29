import { randomUUID } from "node:crypto";
import {
	type CallHandler,
	type ExecutionContext,
	Injectable,
	Logger,
	type NestInterceptor,
} from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { getClientIp } from "@utils/net/client-ip";
import { redact } from "@utils/redact.util";
import { type Observable, tap } from "rxjs";

/**
 * Одна строка на запрос: что спросили, кто, сколько заняло, чем кончилось.
 *
 * Три решения, которые делают лог полезным, а не объёмным:
 *
 * 1. **Одна строка, а не три.** «Запрос начался» + «запрос кончился» в двух
 *    строках приходится склеивать глазами, а под нагрузкой они ещё и
 *    перемешаны между собой. Пишем один раз, по завершении, с длительностью.
 *
 * 2. **Идентификатор запроса.** Приходит из заголовка `x-request-id`
 *    (его ставит фронт или край сети) или генерируется. По нему одна ошибка
 *    у пользователя связывается с цепочкой строк в логе — иначе разбор
 *    инцидента это поиск по времени, а время у всех своё.
 *
 * 3. **Переменная часть проходит через `redact`.** Логи уезжают в агрегатор,
 *    в Sentry и в скриншот в чате. Токен, попавший туда, придётся ротировать.
 *
 * ⚠️ Чего этот интерцептор НЕ видит: запросы, отклонённые guard'ом. В NestJS
 * guard'ы выполняются РАНЬШЕ интерцепторов, поэтому 401 сюда не доходит —
 * его пишет фильтр исключений, и там же проставляется `requestId`.
 *
 * Разменять это на middleware (оно видит всё) нельзя без потери: middleware
 * знает только `POST /gql` и не знает, какую операцию спросили. Мы выбрали
 * знать операцию; цена — отклонённые запросы логируются в другом месте.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
	private readonly logger = new Logger("REQUEST");

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const type = context.getType<string>();
		if (type !== "http" && type !== "graphql") return next.handle();

		const startedAt = Date.now();
		const request =
			type === "graphql"
				? GqlExecutionContext.create(context).getContext().req
				: context.switchToHttp().getRequest();

		const requestId = request?.headers?.["x-request-id"] ?? randomUUID();
		if (request) request.requestId = requestId;

		const what =
			type === "graphql"
				? `${GqlExecutionContext.create(context).getInfo()?.parentType?.name}.${
						GqlExecutionContext.create(context).getInfo()?.fieldName
					}`
				: `${request?.method} ${request?.url}`;

		const who = getClientIp(request) || "unknown";

		return next.handle().pipe(
			tap({
				next: () => this.write(requestId, what, who, startedAt, "ok"),
				// Ошибку тоже фиксируем ЗДЕСЬ: фильтр исключений напишет свою
				// строку, но без длительности и без того, какой запрос это был.
				error: (error) =>
					this.write(
						requestId,
						what,
						who,
						startedAt,
						`error ${error instanceof Error ? error.message : String(error)}`,
					),
			}),
		);
	}

	private write(
		requestId: string,
		what: string,
		who: string,
		startedAt: number,
		outcome: string,
	): void {
		const ms = Date.now() - startedAt;
		// Порядок полей постоянный: по такому логу можно грепать и строить
		// графики. Строка, где поля пляшут, годится только для чтения глазами.
		this.logger.log(
			JSON.stringify(redact({ requestId, what, ip: who, ms, outcome })),
		);
	}
}
