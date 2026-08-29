import { JobName } from "@app/app.enum";
import type { Job } from "bullmq";
import { OrderStatusEnum } from "../order.enum";
import { canTransitionToFulfilled } from "../order.helpers";
import { OrderProcessor } from "./order.processor";

/**
 * A MULTI-TICK test.
 *
 * Most bugs in a queue-driven system do not live inside one run of the
 * processor — they live in the transition between run 1 and run 2 against
 * shared state. A test that builds fresh mocks, calls `process()` once and
 * asserts on the result is green in exactly the situation where production
 * charges the customer twice.
 *
 * So the fake below keeps STATE across calls, and the important test calls the
 * processor twice with the same job.
 */
class FakeOrderStore {
	private orders = new Map<
		string,
		{
			_id: string;
			userId: string;
			totalUsd: number;
			status: OrderStatusEnum;
			attempts: number;
			providerRef?: string;
			lastError?: string;
		}
	>();

	seed(id: string, totalUsd: number): void {
		this.orders.set(id, {
			_id: id,
			userId: "u1",
			totalUsd,
			status: OrderStatusEnum.Pending,
			attempts: 0,
		});
	}

	get(id: string) {
		return this.orders.get(id);
	}

	/** Mirrors the atomic conditional update in OrderService.claim. */
	async claim(id: string) {
		const order = this.orders.get(id);
		if (!order || order.status !== OrderStatusEnum.Pending) return null;
		order.status = OrderStatusEnum.Queued;
		order.attempts += 1;
		return { ...order };
	}

	async markFulfilled(id: string, providerRef: string) {
		const order = this.orders.get(id);
		if (!order) return null;
		if (!canTransitionToFulfilled(order.status)) return { ...order };
		order.status = OrderStatusEnum.Fulfilled;
		order.providerRef = providerRef;
		return { ...order };
	}

	async markFailed(id: string, reason: string) {
		const order = this.orders.get(id);
		if (!order) return;
		order.status = OrderStatusEnum.Failed;
		order.lastError = reason;
	}

	async release(id: string, reason: string) {
		const order = this.orders.get(id);
		if (!order || order.status !== OrderStatusEnum.Queued) return;
		order.status = OrderStatusEnum.Pending;
		order.lastError = reason;
	}

	async findById(id: string) {
		const order = this.orders.get(id);
		return order ? { ...order } : null;
	}
}

const makeJob = (orderId: string, attemptsMade = 0, attempts = 3): Job =>
	({
		name: JobName.FULFILL_ORDER,
		data: { orderId },
		attemptsMade,
		opts: { attempts },
	}) as unknown as Job;

describe("OrderProcessor.fulfil", () => {
	let store: FakeOrderStore;
	let charge: jest.Mock;
	let enqueueConfirm: jest.Mock;
	let recordOrderEvent: jest.Mock;
	let processor: OrderProcessor;

	beforeEach(() => {
		store = new FakeOrderStore();
		charge = jest.fn().mockResolvedValue({ providerRef: "ext_123" });
		enqueueConfirm = jest.fn().mockResolvedValue(undefined);
		recordOrderEvent = jest.fn().mockResolvedValue(undefined);

		processor = new OrderProcessor(
			store as never,
			{ enqueueConfirm, enqueueFulfil: jest.fn() } as never,
			{ charge, verify: jest.fn().mockResolvedValue(true) } as never,
			{ recordOrderEvent } as never,
		);
	});

	// THE test. Everything else in this file is secondary.
	it("charges ONCE when the same job is delivered twice", async () => {
		store.seed("o1", 50);

		await processor.process(makeJob("o1"));
		await processor.process(makeJob("o1")); // redelivery after a lock expiry

		expect(charge).toHaveBeenCalledTimes(1);
		expect(store.get("o1")?.status).toBe(OrderStatusEnum.Fulfilled);
	});

	it("charges once even when two workers race for the same order", async () => {
		store.seed("o2", 50);

		// Both start before either finishes — the claim decides the winner.
		await Promise.all([
			processor.process(makeJob("o2")),
			processor.process(makeJob("o2")),
		]);

		expect(charge).toHaveBeenCalledTimes(1);
	});

	it("marks the order fulfilled and schedules the verification job", async () => {
		store.seed("o3", 50);

		await processor.process(makeJob("o3"));

		expect(store.get("o3")).toMatchObject({
			status: OrderStatusEnum.Fulfilled,
			providerRef: "ext_123",
		});
		expect(enqueueConfirm).toHaveBeenCalledWith("o3");
	});

	it("releases the order back to Pending on a retryable failure, so the retry can claim it", async () => {
		store.seed("o4", 50);
		const transient = Object.assign(new Error("upstream 503"), { status: 503 });
		charge.mockRejectedValueOnce(transient);

		// Tick 1: fails, rethrows so BullMQ retries.
		await expect(processor.process(makeJob("o4", 0))).rejects.toThrow(
			"upstream 503",
		);
		expect(store.get("o4")?.status).toBe(OrderStatusEnum.Pending);

		// Tick 2: the retry. This is what a single-tick test never checks — and
		// if `release` were missing, the order would still be Queued here and
		// the retry would silently skip it forever.
		await processor.process(makeJob("o4", 1));

		expect(store.get("o4")?.status).toBe(OrderStatusEnum.Fulfilled);
		expect(charge).toHaveBeenCalledTimes(2);
	});

	it("does not retry a 4xx — it fails the order on the first attempt", async () => {
		store.seed("o5", 50);
		charge.mockRejectedValue(
			Object.assign(new Error("bad request"), { status: 400 }),
		);

		await processor.process(makeJob("o5", 0));

		expect(store.get("o5")?.status).toBe(OrderStatusEnum.Failed);
		expect(charge).toHaveBeenCalledTimes(1);
	});

	it("fails the order when the last attempt is exhausted, instead of rethrowing forever", async () => {
		store.seed("o6", 50);
		charge.mockRejectedValue(
			Object.assign(new Error("still down"), { status: 503 }),
		);

		// attemptsMade 2 of 3 → this is the final attempt.
		await processor.process(makeJob("o6", 2, 3));

		expect(store.get("o6")?.status).toBe(OrderStatusEnum.Failed);
		expect(recordOrderEvent).toHaveBeenCalledWith(
			expect.objectContaining({ eventType: "FAILED" }),
		);
	});

	it("skips an order that no longer exists without throwing", async () => {
		const result = await processor.process(makeJob("ghost"));
		expect(result).toEqual({ skipped: true });
		expect(charge).not.toHaveBeenCalled();
	});
});
