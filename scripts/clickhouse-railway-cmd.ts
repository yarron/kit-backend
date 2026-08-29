import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Turn clickhouse/*.xml into the startCommand Railway needs.
 *
 *     pnpm ch:railway-cmd            # for the instance the files are sized for
 *     pnpm ch:railway-cmd --ram 12   # check the files against a 12 GiB instance
 *
 * Railway has no volume to mount a config file from, so the config has to be
 * written by the start command itself. Its parser eats backslashes, which means
 * an inline XML string comes back mangled and ClickHouse dies on startup with a
 * SAXParseException — taking the service with it. base64 has no character the
 * parser wants to touch, so that is the only shape that survives.
 *
 * The blob is write-only: nobody reviews base64 in a PR, and nobody can edit it
 * in place. So the XML lives in the repo and the blob is GENERATED from it —
 * change a setting in the file, run this, paste the result.
 */
const ROOT = join(__dirname, "..", "clickhouse");

const FILES = [
	{ src: "config.d/zz-system-log-ttl.xml", dest: "/etc/clickhouse-server/config.d/zz-system-log-ttl.xml" },
	{ src: "users.d/zz-disable-profiler.xml", dest: "/etc/clickhouse-server/users.d/zz-disable-profiler.xml" },
	{ src: "config.d/zz-memory.xml", dest: "/etc/clickhouse-server/config.d/zz-memory.xml" },
] as const;

const GIB = 1024 ** 3;

/**
 * Sizing derived from one number: how much RAM the instance has.
 *
 * The server cap gets 75%, leaving the rest to the OS and the page cache that
 * ClickHouse actually reads through. One query may claim up to half the box —
 * enough for real work, small enough that a runaway GROUP BY hits its own limit
 * before it hits the server's. Spilling starts at half of that again, because
 * the merge phase needs headroom: a spill threshold equal to the ceiling means
 * the query dies at the exact moment it tries to save itself.
 */
function sizingFor(ramGib: number) {
	return {
		max_server_memory_usage: Math.round(ramGib * 0.75 * GIB),
		max_memory_usage: Math.round(ramGib * 0.5 * GIB),
		max_bytes_before_external_group_by: Math.round(ramGib * 0.25 * GIB),
		max_bytes_before_external_sort: Math.round(ramGib * 0.25 * GIB),
	};
}

/** Strip comments and inter-tag whitespace — the blob should carry settings, not prose. */
function minify(xml: string): string {
	return xml
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/>\s+</g, "><")
		.trim();
}

function readSetting(xml: string, name: string): number | undefined {
	const m = xml.match(new RegExp(`<${name}>(\\d+)</${name}>`));
	return m ? Number(m[1]) : undefined;
}

function ramArg(): number | undefined {
	const i = process.argv.indexOf("--ram");
	if (i === -1) return undefined;
	const v = Number(process.argv[i + 1]);
	if (!Number.isFinite(v) || v <= 0) {
		console.error("--ram expects a number of GiB, e.g. --ram 12");
		process.exit(1);
	}
	return v;
}

function main(): void {
	const sources = FILES.map((f) => {
		const path = join(ROOT, f.src);
		if (!existsSync(path)) {
			console.error(`Missing ${f.src} under clickhouse/. The XML is the source of truth —`);
			console.error("restore it from git rather than hand-writing the base64 blob.");
			process.exit(1);
		}
		return { ...f, xml: readFileSync(path, "utf8") };
	});

	const ram = ramArg();
	if (ram !== undefined) {
		const want = sizingFor(ram);
		const all = sources.map((s) => s.xml).join("\n");
		const wrong = Object.entries(want).filter(([k, v]) => readSetting(all, k) !== v);
		if (wrong.length > 0) {
			console.error(`Files are not sized for ${ram} GiB. Fix these, then re-run:\n`);
			for (const [k, v] of wrong) {
				console.error(`  ${k}: ${readSetting(all, k) ?? "missing"} → ${v}  (${(v / GIB).toFixed(2)} GiB)`);
			}
			process.exit(1);
		}
		console.error(`Sizing matches a ${ram} GiB instance.\n`);
	}

	const writes = sources.map((s) => {
		const b64 = Buffer.from(minify(s.xml), "utf8").toString("base64");
		return `echo ${b64} | base64 -d > ${s.dest}`;
	});

	const dirs = [...new Set(FILES.map((f) => f.dest.replace(/\/[^/]+$/, "")))].join(" ");
	console.log(`bash -c "mkdir -p ${dirs} && ${writes.join(" && ")} && exec /entrypoint.sh"`);
}

main();
