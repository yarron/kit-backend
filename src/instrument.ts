import * as Sentry from "@sentry/nestjs";

/**
 * Sentry has to be initialised BEFORE Nest and before any instrumented library
 * is imported — that is why this file is imported on the very first line of
 * `main.ts` and does nothing else.
 *
 * Get the order wrong and Sentry still "works": it just silently misses the
 * HTTP, Mongo and Redis spans, and you spend a day wondering why traces are
 * empty.
 *
 * No DSN (local development) → init is a no-op and every `captureException`
 * call downstream costs nothing.
 */
Sentry.init({
	dsn: process.env.SENTRY_DSN || undefined,
	environment: process.env.PLATFORM_ENV || "local",
	release: `${process.env.npm_package_name}@${process.env.npm_package_version}`,
	// Sampling, not 100%: traces are billed, and a busy endpoint does not need
	// every request measured to show you its latency.
	tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
	// Never ship request bodies by default: they carry customer data, and an
	// error tracker is not the place for it.
	sendDefaultPii: false,
});
