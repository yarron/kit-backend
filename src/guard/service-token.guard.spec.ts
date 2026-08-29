import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { CONFIG } from "@src/config";
import { ServiceTokenGuard } from "./service-token.guard";

jest.mock("@src/config", () => ({
	CONFIG: { platform: { serviceToken: "s3cr3t-token" } },
}));

const httpCtx = (headers: Record<string, unknown>): ExecutionContext =>
	({
		getType: () => "http",
		getHandler: () => () => undefined,
		getClass: () => class {},
		switchToHttp: () => ({ getRequest: () => ({ headers }) }),
	}) as unknown as ExecutionContext;

const reflector = (isPublic = false) =>
	({ getAllAndOverride: () => isPublic }) as unknown as Reflector;

describe("ServiceTokenGuard", () => {
	it("пропускает с верным секретом", () => {
		const guard = new ServiceTokenGuard(reflector());
		expect(
			guard.canActivate(httpCtx({ "x-service-token": "s3cr3t-token" })),
		).toBe(true);
	});

	it("отклоняет без заголовка", () => {
		const guard = new ServiceTokenGuard(reflector());
		expect(() => guard.canActivate(httpCtx({}))).toThrow(UnauthorizedException);
	});

	it("отклоняет верный префикс — длина проверяется первой", () => {
		// timingSafeEqual бросает на разной длине, поэтому порядок важен.
		const guard = new ServiceTokenGuard(reflector());
		expect(() =>
			guard.canActivate(httpCtx({ "x-service-token": "s3cr3t" })),
		).toThrow(UnauthorizedException);
	});

	it("пропускает маршрут, помеченный @Public", () => {
		const guard = new ServiceTokenGuard(reflector(true));
		expect(guard.canActivate(httpCtx({}))).toBe(true);
	});

	it("выключен, когда секрет не задан", () => {
		// Локальная разработка. В main.ts об этом пишется WARN — иначе
		// «выключено» и «работает» выглядят одинаково.
		(CONFIG.platform as { serviceToken: string }).serviceToken = "";
		const guard = new ServiceTokenGuard(reflector());
		expect(guard.canActivate(httpCtx({}))).toBe(true);
		(CONFIG.platform as { serviceToken: string }).serviceToken = "s3cr3t-token";
	});
});
