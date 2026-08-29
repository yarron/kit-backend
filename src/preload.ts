/**
 * Loaded first from `main.ts`, before anything else is imported.
 *
 * `reflect-metadata` must be present before the first decorator is evaluated,
 * and the timezone must be UTC before the first `new Date()` is constructed.
 * Both are process-global and both fail in ways that look like data bugs:
 * a container running in a non-UTC region silently shifts every "start of day"
 * aggregate by a few hours.
 */
import "reflect-metadata";

process.env.TZ = process.env.TZ || "UTC";
