import { timingSafeEqual } from "node:crypto";
import {
	type CanActivate,
	type ExecutionContext,
	Injectable,
	UnauthorizedException,
} from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { CONFIG } from "@src/config";

/**
 * Header-based auth for the admin surface.
 *
 * Two details that are not decoration:
 *
 * 1. The request object is in a DIFFERENT place for HTTP and GraphQL.
 *    `context.switchToHttp().getRequest()` returns undefined inside a resolver,
 *    and a guard that reads undefined headers does not throw — it just finds no
 *    key and rejects everyone, or worse, is written defensively and lets
 *    everyone through.
 *
 * 2. The comparison is timing-safe. `a === b` on strings returns as soon as two
 *    bytes differ, so response time leaks how much of the key was right. That
 *    is a real, practised attack, and `timingSafeEqual` costs nothing.
 *
 * A real project replaces this with JWT or a session; the shape stays the same.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const request =
			context.getType<string>() === "graphql"
				? GqlExecutionContext.create(context).getContext().req
				: context.switchToHttp().getRequest();

		const provided = request?.headers?.["x-api-key"];
		if (!provided || typeof provided !== "string") {
			throw new UnauthorizedException("Missing x-api-key header");
		}

		if (!this.matches(provided, CONFIG.platform.apiKey)) {
			throw new UnauthorizedException("Invalid API key");
		}

		return true;
	}

	private matches(provided: string, expected: string): boolean {
		if (!expected) return false;

		const a = Buffer.from(provided);
		const b = Buffer.from(expected);

		// timingSafeEqual throws on length mismatch, so length is compared first —
		// length is not a secret, the contents are.
		if (a.length !== b.length) return false;

		return timingSafeEqual(a, b);
	}
}
