import type { INestApplication } from "@nestjs/common";
import request from "supertest";

export interface GraphqlResult<T = unknown> {
	data?: T;
	errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

/**
 * One helper instead of repeating the POST shape in every test.
 *
 * Note it does NOT assert success: some tests are about the error. A helper
 * that throws on `errors` cannot test authorisation, validation or conflicts —
 * i.e. most of what is worth testing.
 */
export const gql = async <T = unknown>(
	app: INestApplication,
	query: string,
	variables?: Record<string, unknown>,
	apiKey = process.env.PLATFORM_KEY ?? "test-admin-key",
): Promise<GraphqlResult<T>> => {
	const response = await request(app.getHttpServer())
		.post("/gql")
		.set("x-api-key", apiKey)
		.send({ query, variables });

	return response.body as GraphqlResult<T>;
};
