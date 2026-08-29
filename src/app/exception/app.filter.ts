import {
	type ArgumentsHost,
	Catch,
	type ExceptionFilter,
	type ExecutionContext,
	HttpException,
	Logger,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { GqlExecutionContext } from "@nestjs/graphql";
import { GraphQLError } from "graphql";

/**
 * One global exception filter for both transports.
 *
 * Two things it must get right, and both are easy to get wrong:
 *
 * 1. A GraphQL request has no `res` to write a status code to. Detect the host
 *    type; returning an HTTP response from a GraphQL context throws inside the
 *    filter itself, and then you lose the original error entirely.
 *
 * 2. An unexpected error must not leak its message to the client. A stack trace
 *    or a driver error string tells an attacker your schema, your versions and
 *    sometimes your data. Log everything, return "Internal server error".
 */
/**
 * HTTP status -> GraphQL error code.
 *
 * GraphQL has no status codes, so clients branch on `extensions.code`. Sending
 * BAD_REQUEST for everything means a client cannot tell "your token expired,
 * log in again" from "this input is invalid" — and it will guess by matching
 * the message string, which breaks the next time you reword it.
 */
const GRAPHQL_ERROR_CODES: Record<number, string> = {
	400: "BAD_REQUEST",
	401: "UNAUTHENTICATED",
	403: "FORBIDDEN",
	404: "NOT_FOUND",
	409: "CONFLICT",
	422: "UNPROCESSABLE_ENTITY",
	429: "TOO_MANY_REQUESTS",
};

const defaultCode = (status: number): string =>
	status >= 500 ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST";

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
	private readonly logger = new Logger("EXCEPTION");

	constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

	catch(exception: unknown, host: ArgumentsHost): void {
		const hostType = host.getType<string>();

		const isHttpException = exception instanceof HttpException;
		const status = isHttpException ? exception.getStatus() : 500;

		// Deliberate 4xx errors are the app talking to the client and are safe to
		// pass through. Anything else is a bug and gets a generic message.
		const clientMessage = isHttpException
			? exception.message
			: "Internal server error";

		const realMessage =
			exception instanceof Error ? exception.message : String(exception);

		if (status >= 500) {
			this.logger.error(`[${hostType}] ${realMessage}`);
			if (exception instanceof Error && exception.stack) {
				this.logger.error(exception.stack);
			}
		} else {
			this.logger.warn(`[${hostType}] ${status} ${realMessage}`);
		}

		// This is where Sentry.captureException(exception) goes in a real project.

		if (hostType === "graphql") {
			// Throwing from the filter is how Apollo learns about the error: it is
			// caught by the GraphQL layer and lands in the `errors` array.
			const gqlCtx = GqlExecutionContext.create(host as ExecutionContext);
			const info = gqlCtx.getInfo();
			throw new GraphQLError(clientMessage, {
				extensions: {
					code: GRAPHQL_ERROR_CODES[status] ?? defaultCode(status),
					status,
					path: info?.path,
				},
			});
		}

		if (hostType !== "http") return;

		const { httpAdapter } = this.httpAdapterHost;
		const ctx = host.switchToHttp();

		httpAdapter.reply(
			ctx.getResponse(),
			{
				statusCode: status,
				message: clientMessage,
				timestamp: new Date().toISOString(),
				path: httpAdapter.getRequestUrl(ctx.getRequest()),
			},
			status,
		);
	}
}
