import { ConflictException, NotFoundException } from "@nestjs/common";
import { UserRoleEnum } from "./user.enum";
import { UserService } from "./user.service";

/**
 * A service tested WITHOUT a database.
 *
 * The model is a plain object with jest mocks. That is possible only because
 * the service takes the model through the constructor — dependency injection is
 * not ceremony, it is the thing that makes this file three lines of setup
 * instead of a docker-compose.
 */
const mockQuery = <T>(result: T) => ({
	lean: () => ({ exec: async () => result }),
	exec: async () => result,
});

describe("UserService", () => {
	let model: {
		create: jest.Mock;
		findOne: jest.Mock;
		findOneAndUpdate: jest.Mock;
		schema: { paths: Record<string, unknown> };
	};
	let service: UserService;

	beforeEach(() => {
		model = {
			create: jest.fn(),
			findOne: jest.fn(),
			findOneAndUpdate: jest.fn(),
			schema: { paths: { email: {}, name: {}, role: {}, isActive: {} } },
		};
		service = new UserService(model as never);
	});

	describe("create", () => {
		it("returns a plain object, not a Mongoose document", async () => {
			const doc = { toObject: () => ({ _id: "1", email: "a@b.c" }) };
			model.create.mockResolvedValue(doc);

			await expect(
				service.create({ email: "a@b.c", name: "A" }),
			).resolves.toEqual({
				_id: "1",
				email: "a@b.c",
			});
		});

		// The interesting case: we do NOT pre-check for an existing email,
		// because between a check and an insert another request can create it.
		// The unique index decides; this test pins the translation of its error.
		it("translates Mongo duplicate-key 11000 into a 409", async () => {
			model.create.mockRejectedValue({ code: 11000 });

			await expect(
				service.create({ email: "a@b.c", name: "A" }),
			).rejects.toBeInstanceOf(ConflictException);
		});

		it("rethrows any other database error untouched", async () => {
			model.create.mockRejectedValue(new Error("connection lost"));

			await expect(
				service.create({ email: "a@b.c", name: "A" }),
			).rejects.toThrow("connection lost");
		});
	});

	describe("update", () => {
		it("strips undefined fields so they are not written as null", async () => {
			model.findOneAndUpdate.mockReturnValue(
				mockQuery({ _id: "1", name: "New" }),
			);

			await service.update({ id: "1", name: "New", role: undefined });

			const [, update] = model.findOneAndUpdate.mock.calls[0];
			expect(update).toEqual({ $set: { name: "New" } });
			expect(update.$set).not.toHaveProperty("role");
		});

		it("scopes the update to non-deleted users", async () => {
			model.findOneAndUpdate.mockReturnValue(mockQuery({ _id: "1" }));

			await service.update({ id: "1", role: UserRoleEnum.Admin });

			const [filter] = model.findOneAndUpdate.mock.calls[0];
			expect(filter).toEqual({ _id: "1", deletedAt: { $exists: false } });
		});

		it("throws 404 when nothing matched", async () => {
			model.findOneAndUpdate.mockReturnValue(mockQuery(null));

			await expect(
				service.update({ id: "gone", name: "x" }),
			).rejects.toBeInstanceOf(NotFoundException);
		});
	});

	describe("deactivate", () => {
		it("soft-deletes instead of removing the row", async () => {
			model.findOneAndUpdate.mockReturnValue(
				mockQuery({ _id: "1", isActive: false }),
			);

			await service.deactivate("1");

			const [, update] = model.findOneAndUpdate.mock.calls[0];
			expect(update.$set.isActive).toBe(false);
			expect(update.$set.deletedAt).toBeInstanceOf(Date);
		});

		it("is not repeatable — a second deactivate finds nothing", async () => {
			model.findOneAndUpdate.mockReturnValue(mockQuery(null));

			await expect(service.deactivate("1")).rejects.toBeInstanceOf(
				NotFoundException,
			);
		});
	});
});
