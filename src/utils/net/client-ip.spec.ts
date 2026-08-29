/**
 * The cases that matter are all the same case: a header the client can write
 * must never outrank one a proxy controls. The library this replaced failed
 * every one of them.
 */
import { getClientIp } from "./client-ip";

const req = (
	headers: Record<string, string | string[] | undefined>,
	remoteAddress = "172.16.0.1",
) => ({ headers, socket: { remoteAddress } });

describe("getClientIp", () => {
	it("ignores X-Forwarded-For entirely", () => {
		// The whole point. Railway does not manage this header, so today it
		// arrives exactly as the caller wrote it; Cloudflare appends to it,
		// leaving the caller's entry leftmost. Either way it is not evidence.
		expect(getClientIp(req({ "x-forwarded-for": "8.8.8.8" }))).toBe(
			"172.16.0.1",
		);
	});

	it("prefers Cloudflare's header over Railway's", () => {
		// Behind a proxied domain, X-Real-IP is Cloudflare's edge address, not
		// the visitor's — believing it would file the whole company under one IP.
		expect(
			getClientIp(
				req({
					"cf-connecting-ip": "203.0.113.7",
					"x-real-ip": "198.51.100.2",
				}),
			),
		).toBe("203.0.113.7");
	});

	it("falls back to Railway's header when there is no Cloudflare", () => {
		// The topology in production right now.
		expect(getClientIp(req({ "x-real-ip": "198.51.100.2" }))).toBe(
			"198.51.100.2",
		);
	});

	it("falls back to the socket when nothing is in front", () => {
		expect(getClientIp(req({}, "203.0.113.9"))).toBe("203.0.113.9");
	});

	it("unwraps an IPv4-mapped IPv6 socket address", () => {
		// Otherwise the same machine appears under two spellings and a filter
		// on the plain address quietly misses half its rows.
		expect(getClientIp(req({}, "::ffff:203.0.113.9"))).toBe("203.0.113.9");
	});

	it("keeps a real IPv6 address intact", () => {
		expect(getClientIp(req({ "cf-connecting-ip": "2001:db8::1" }))).toBe(
			"2001:db8::1",
		);
	});

	it("skips a header that is not an address rather than storing it", () => {
		// A proxy misconfiguration must not put "unknown" in an address column.
		expect(
			getClientIp(req({ "cf-connecting-ip": "unknown", "x-real-ip": "" })),
		).toBe("172.16.0.1");
	});

	it("returns empty rather than inventing a placeholder", () => {
		// The predecessor returned "::1" here, which reads as a real local
		// connection. An empty string is the truthful "we do not know".
		expect(getClientIp({ headers: {}, socket: {} })).toBe("");
		expect(getClientIp(undefined)).toBe("");
	});

	it("takes the first value when a header is repeated", () => {
		expect(
			getClientIp(req({ "cf-connecting-ip": ["203.0.113.7", "8.8.8.8"] })),
		).toBe("203.0.113.7");
	});
});
