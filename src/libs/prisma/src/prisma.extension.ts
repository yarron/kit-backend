import { SoftDeleteExtension } from "./extensions/soft-delete.extension";

/**
 * Реестр расширений. Новый `*.extension.ts` — добавь сюда, иначе он мёртвый код.
 *
 * ⚠️ Порядок значим: `$extends` возвращает НОВЫЙ клиент, поэтому расширения
 * оборачивают друг друга в порядке применения. Soft-delete идёт первым, чтобы
 * фильтр «не удалённые» стоял ближе всего к запросу.
 */
const EXTENSIONS = [SoftDeleteExtension];

// biome-ignore lint/suspicious/noExplicitAny: тип расширенного клиента вычисляется Prisma
export function applyExtensions(client: any): any {
	let extended = client;
	for (const extension of EXTENSIONS) {
		extended = extended.$extends(extension);
	}
	return extended;
}
