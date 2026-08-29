import { BadRequestException } from "@nestjs/common";
import { OrderService } from "./order.service";

jest.mock("@src/config", () => ({
	CONFIG: { order: { minTotalUsd: 10, maxTotalUsd: 1000, maxAttempts: 3 } },
}));

const mockQuery = <T>(result: T) => ({
	lean: () => ({ exec: async () => result }),
	exec: async () => result,
});

describe("OrderService.create", () => {
	let model: {
		create: jest.Mock;
		findOne: jest.Mock;
		schema: { paths: Record<string, unknown> };
	};
	let service: OrderService;

	const input = { userId: "u1", totalUsd: 50, idempotencyKey: "k1" };

	beforeEach(() => {
		model = {
			create: jest.fn(),
			findOne: jest.fn(),
			schema: { paths: { userId: {}, totalUsd: {}, status: {} } },
		};
		service = new OrderService(model as never);
	});

	// The expensive case first: a retry must not create a second order.
	it("returns the existing order on a duplicate idempotency key", async () => {
		const existing = { _id: "o1", totalUsd: 50 };
		model.create.mockRejectedValue({ code: 11000 });
		model.findOne.mockReturnValue(mockQuery(existing));

		await expect(service.create(input)).resolves.toEqual(existing);
	});

	it("refuses an order above the provider ceiling instead of silently clamping it", async () => {
		// Charging less than the customer asked for is worse than refusing:
		// they believe they bought something they did not.
		await expect(
			service.create({ ...input, totalUsd: 5_000 }),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(model.create).not.toHaveBeenCalled();
	});

	it("rounds the total to two decimals before storing it", async () => {
		model.create.mockResolvedValue({ toObject: () => ({ _id: "o2" }) });

		await service.create({ ...input, totalUsd: 1.005 });

		// 1.005 * 100 === 100.49999999999999 — naive rounding stores 1.00 here.
		expect(model.create.mock.calls[0][0].totalUsd).toBe(1.01);
	});

	it("keeps a below-floor order — it is accumulated, not rejected", async () => {
		model.create.mockResolvedValue({ toObject: () => ({ _id: "o3" }) });

		await service.create({ ...input, totalUsd: 3 });

		expect(model.create.mock.calls[0][0].totalUsd).toBe(3);
	});
});
