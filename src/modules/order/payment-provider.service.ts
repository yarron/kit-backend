import { Injectable, Logger } from "@nestjs/common";

export interface ChargeResult {
	providerRef: string;
}

/**
 * Stand-in for a real external provider (Stripe, a bank, a partner API).
 *
 * It exists as an injectable CLASS rather than a module-level `fetch` call for
 * one reason: a test can replace it. Code that calls `fetch` directly can only
 * be tested by patching the global, and a suite that patches globals leaks
 * state between files.
 *
 * The fake failure below is what lets you watch retries and backoff behave in
 * `pnpm local` without signing up for anything.
 */
@Injectable()
export class PaymentProviderService {
	private readonly logger = new Logger(PaymentProviderService.name);

	async charge(orderId: string, amountUsd: number): Promise<ChargeResult> {
		this.logger.debug(`charge ${orderId} $${amountUsd}`);

		// Simulated transient failure — replace with a real HTTP call.
		if (amountUsd > 5_000) {
			const error = new Error("provider temporarily unavailable") as Error & {
				status: number;
			};
			error.status = 503;
			throw error;
		}

		return { providerRef: `ext_${orderId.slice(-8)}` };
	}

	/**
	 * Ask the provider what it thinks the state is.
	 *
	 * Needed because "we sent the charge and the connection dropped" is not the
	 * same as "the charge did not happen". The only way to know is to ask, and
	 * the only reason you CAN ask is that you sent an idempotency key.
	 */
	async verify(providerRef: string): Promise<boolean> {
		return providerRef.startsWith("ext_");
	}
}
