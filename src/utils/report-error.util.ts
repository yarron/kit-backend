import { Logger } from "@nestjs/common";
import * as Sentry from "@sentry/nestjs";

/**
 * The ONLY sanctioned way to handle an error you are not rethrowing.
 *
 * The project rule is absolute: no silent catch. `catch {}`,
 * `catch(() => null)` and `.catch(() => undefined)` are banned — an exception
 * swallowed in code is one nobody will ever see, filter or find. Returning a
 * fallback value does not excuse it either.
 *
 * So every such catch calls this: it logs WITH context and reports to Sentry
 * with tags you can group and filter by.
 *
 * The usual objection — "Sentry will be noisy" — is answered in Sentry, not in
 * the code: noise is muted there with rules and ignored groups, and what
 * survives the cleanup is real. Noise you can silence later; a swallowed
 * exception is gone forever.
 */
export interface ErrorContext {
	/** What we were doing, e.g. "order.fulfil". Becomes a Sentry tag. */
	operation: string;
	/** Anything that helps reproduce: ids, sizes, the key that failed. */
	extra?: Record<string, unknown>;
	/** Below "error" for expected-but-notable failures on hot paths. */
	level?: "warning" | "error";
}

export function reportError(
	logger: Logger,
	error: unknown,
	context: ErrorContext,
): void {
	const message = error instanceof Error ? error.message : String(error);
	const extra = context.extra ? ` ${JSON.stringify(context.extra)}` : "";
	const line = `[${context.operation}] ${message}${extra}`;

	if (context.level === "warning") {
		logger.warn(line);
	} else {
		logger.error(line);
		if (error instanceof Error && error.stack) logger.error(error.stack);
	}

	// A no-op when SENTRY_DSN is unset, so local runs stay quiet without any
	// branching at the call site.
	Sentry.captureException(error, {
		level: context.level ?? "error",
		tags: { operation: context.operation },
		extra: context.extra,
	});
}
