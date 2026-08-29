import { timingSafeEqual } from "node:crypto";
import {
	type CanActivate,
	type ExecutionContext,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GqlExecutionContext } from "@nestjs/graphql";
import { CONFIG } from "@src/config";
import { IS_PUBLIC_KEY } from "./public.decorator";

/**
 * Глобальный guard: бэкенд принимает запросы ТОЛЬКО от своих сервисов.
 *
 * Это ядро топологии BFF. Фронт (Next.js) ходит сюда по приватной сети и
 * добавляет общий секрет; браузер сюда не ходит вовсе. Даже если адрес
 * бэкенда узнают, без секрета он отвечает 401.
 *
 * Три вещи, которые надо понимать честно:
 *
 * 1. Это НЕ авторизация пользователя. Кто именно спрашивает — приходит
 *    отдельно (заголовок identity от фронта), и права проверяются резолвером.
 * 2. Секрет — второй рубеж ПОВЕРХ приватной сети, а не вместо неё. Он
 *    защищает от соседнего сервиса в том же проекте, который скомпрометировали.
 * 3. Пустой `SERVICE_TOKEN` выключает проверку. Это допустимо локально —
 *    и об этом громко пишется в лог при старте.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	canActivate(context: ExecutionContext): boolean {
		const expected = CONFIG.platform.serviceToken;
		if (!expected) return true;

		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
			context.getHandler(),
			context.getClass(),
		]);
		if (isPublic) return true;

		const request =
			context.getType<string>() === "graphql"
				? GqlExecutionContext.create(context).getContext().req
				: context.switchToHttp().getRequest();

		const provided = request?.headers?.["x-service-token"];

		if (typeof provided !== "string" || provided.length !== expected.length) {
			throw new UnauthorizedException("Invalid service token");
		}

		if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
			throw new UnauthorizedException("Invalid service token");
		}

		return true;
	}
}
