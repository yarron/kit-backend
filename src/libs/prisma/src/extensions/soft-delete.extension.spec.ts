import {
	SoftDeleteExtension,
	SoftDeleteViolationError,
} from "./soft-delete.extension";

const q = SoftDeleteExtension.query.$allModels;

describe("SoftDeleteExtension", () => {
	const query = jest.fn(async (args: unknown) => args);

	beforeEach(() => query.mockClear());

	it("подмешивает deletedAt: null в чтения soft-delete модели", async () => {
		const args: Record<string, unknown> = {};
		await q.findMany({ model: "Invoice", args, query } as never);

		expect(args.where).toEqual({ deletedAt: null });
	});

	it("не трогает явно переданный deletedAt", async () => {
		// Иногда удалённые нужны — например, в админском отчёте.
		const args = { where: { deletedAt: { not: null } } };
		await q.findMany({ model: "Invoice", args, query } as never);

		expect(args.where).toEqual({ deletedAt: { not: null } });
	});

	it("не трогает модели без soft delete", async () => {
		const args: Record<string, unknown> = {};
		await q.findMany({ model: "SomethingElse", args, query } as never);

		expect(args.where).toBeUndefined();
	});

	// Главное: операция не подменяется молча.
	it("delete на soft-delete модели падает громко, а не превращается в update", async () => {
		await expect(
			q.delete({
				model: "Invoice",
				args: { where: { id: 1 } },
				query,
			} as never),
		).rejects.toBeInstanceOf(SoftDeleteViolationError);

		expect(query).not.toHaveBeenCalled();
	});

	it("deleteMany — так же", async () => {
		await expect(
			q.deleteMany({ model: "Invoice", args: {}, query } as never),
		).rejects.toBeInstanceOf(SoftDeleteViolationError);
	});

	it("обычная модель удаляется как обычно", async () => {
		await q.delete({
			model: "Plain",
			args: { where: { id: 1 } },
			query,
		} as never);
		expect(query).toHaveBeenCalled();
	});
});
