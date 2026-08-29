#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { glob } from "glob";

/**
 * Собирает единый `prisma/schema.prisma` из кусочков, лежащих В МОДУЛЯХ.
 *
 * Зачем: один общий файл схемы на весь проект — это файл, который правят все
 * и в котором конфликтует каждый второй merge. Модель живёт рядом со своим
 * модулем (`src/modules/invoice/invoice.prisma`), а Prisma получает склейку.
 *
 * Файл-результат генерируемый: править его руками бессмысленно, следующий
 * `pnpm prisma:sync` перезапишет.
 */
const SOURCE_PATTERN = "src/modules/**/*.prisma";
const TARGET_FILE = "prisma/schema.prisma";
const ROOT = process.cwd();

const HEADER = `// AUTO-GENERATED — не редактируй руками.
// Источники: src/modules/**/*.prisma. Пересобрать: pnpm prisma:sync

generator client {
  provider      = "prisma-client-js"
  output        = "./generated"
  binaryTargets = ["native", "debian-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;

async function main(): Promise<void> {
	const files = (await glob(SOURCE_PATTERN, { cwd: ROOT, absolute: false })).sort();

	if (files.length === 0) {
		console.log("Не найдено ни одного .prisma в src/modules — пишу только конфиг.");
	}

	const parts: string[] = [HEADER];

	for (const file of files) {
		const moduleName = file.replace("src/modules/", "").replace(/\/[^/]+\.prisma$/, "");
		parts.push(`// ── module: ${moduleName} (${file}) ──`);
		parts.push(fs.readFileSync(path.join(ROOT, file), "utf-8"));
		console.log(`  + ${file}`);
	}

	const target = path.join(ROOT, TARGET_FILE);
	const content = parts.join("\n");

	// Не переписываем без изменений: лишняя запись дёргает watch-режимы.
	if (fs.existsSync(target) && fs.readFileSync(target, "utf-8") === content) {
		console.log(`${TARGET_FILE} уже актуален`);
		return;
	}

	fs.writeFileSync(target, content);
	console.log(`${TARGET_FILE} собран из ${files.length} файлов`);
}

main().catch((error) => {
	console.error("prisma:sync failed:", error);
	process.exit(1);
});
