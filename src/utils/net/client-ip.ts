import { isIP } from "node:net";

/**
 * The address the request actually came from.
 *
 * Written by hand because `request-ip`, which this replaces, reads
 * `x-forwarded-for` BEFORE `cf-connecting-ip` and takes the LEFTMOST element of
 * the chain (`request-ip@3.3.0`, lib/index.js:29-45). That element is under the
 * client's control in both topologies these services run in, so the value it
 * returned could be set with one curl flag:
 *
 * - **Railway today.** Railway's edge sets `X-Real-IP` and does not manage
 *   `X-Forwarded-For` at all (docs.railway.com, "Request Headers"), so whatever
 *   the client sends in XFF arrives verbatim.
 * - **Behind Cloudflare later.** Cloudflare APPENDS to XFF rather than
 *   replacing it — `<whatever the client sent>, <the real address>` — so the
 *   leftmost element stays the client's. It overwrites `CF-Connecting-IP`
 *   unconditionally, which is what makes that header the trustworthy one.
 *
 * Hence the order below, and hence XFF is not consulted at all. It carries no
 * information here that a header we control does not already carry.
 *
 * ONE CAVEAT, which is an infrastructure decision rather than a code one: once
 * the domain is proxied, `CF-Connecting-IP` is only as good as the origin being
 * unreachable directly. While `*.up.railway.app` answers the public internet,
 * anyone can bypass Cloudflare and set that header themselves.
 */

/** Set by Cloudflare, overwritten on every request. Trustworthy behind CF. */
const CLOUDFLARE = "cf-connecting-ip";

/**
 * Set by Railway's edge. Correct today; behind Cloudflare it becomes
 * Cloudflare's own address, which is why it is second rather than first.
 */
const RAILWAY = "x-real-ip";

interface WithHeaders {
	headers?: Record<string, string | string[] | undefined>;
	socket?: { remoteAddress?: string };
}

export function getClientIp(req: WithHeaders | undefined): string {
	if (!req) return "";

	for (const name of [CLOUDFLARE, RAILWAY]) {
		const value = normalize(first(req.headers?.[name]));
		if (isIP(value)) return value;
	}

	// No proxy in front — local development, or a direct hit on the origin.
	const socket = normalize(req.socket?.remoteAddress);
	return isIP(socket) ? socket : "";
}

/** A repeated header arrives as an array; the first occurrence is the proxy's. */
function first(value: string | string[] | undefined): string {
	if (Array.isArray(value)) return value[0] ?? "";
	return value ?? "";
}

/**
 * Node reports IPv4 over a dual-stack socket as `::ffff:203.0.113.7`. Stored
 * as-is it would be a second, unequal spelling of an address already in the
 * column, and `ip = '203.0.113.7'` would silently miss half the rows.
 */
function normalize(value: string | undefined): string {
	const trimmed = (value ?? "").trim();
	return trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed;
}
