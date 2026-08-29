import { UserEntity } from "@modules/user";
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import { Test } from "@nestjs/testing";
import { AppModule } from "@src/app";
import type { Model } from "mongoose";
import {
	gql,
	gqlWithoutServiceToken,
} from "../../../../test/helpers/graphql.helper";

/**
 * A real end-to-end test: the whole Nest container, the real GraphQL schema,
 * the real Mongo from docker-compose.
 *
 * It is slower and it catches a completely different class of bug than a unit
 * test — schema build errors, a guard applied to the wrong resolver, a
 * validation pipe that is configured in `main.ts` and therefore missing here.
 * That last one is why the pipe is registered explicitly below: `main.ts` does
 * not run in tests, so anything configured there must be repeated, and
 * forgetting it means your e2e suite tests a DIFFERENT app than production.
 */
describe("User GraphQL (e2e)", () => {
	let app: INestApplication;
	let model: Model<UserEntity>;

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleRef.createNestApplication();
		app.useGlobalPipes(
			new ValidationPipe({
				transform: true,
				whitelist: true,
				forbidNonWhitelisted: true,
			}),
		);
		await app.init();

		model = moduleRef.get<Model<UserEntity>>(getModelToken(UserEntity.name));
	});

	afterAll(async () => {
		await app?.close();
	});

	beforeEach(async () => {
		await model.deleteMany({});
	});

	const CREATE = `
		mutation Create($payload: UserCreateInput!) {
			userCreate(payload: $payload) { _id email name role isActive }
		}
	`;

	it("creates a user", async () => {
		const res = await gql<{ userCreate: { email: string; role: string } }>(
			app,
			CREATE,
			{
				payload: { email: "Alice@Example.com", name: "Alice" },
			},
		);

		expect(res.errors).toBeUndefined();
		// lowercase: true on the schema — the entity normalises, not the caller.
		expect(res.data?.userCreate.email).toBe("alice@example.com");
		expect(res.data?.userCreate.role).toBe("Customer");
	});

	it("rejects a duplicate email with a conflict, not a second row", async () => {
		await gql(app, CREATE, {
			payload: { email: "dup@example.com", name: "One" },
		});
		const res = await gql(app, CREATE, {
			payload: { email: "dup@example.com", name: "Two" },
		});

		expect(res.errors?.[0]?.message).toMatch(/already registered/i);
		expect(await model.countDocuments({ email: "dup@example.com" })).toBe(1);
	});

	it("rejects an unknown field instead of ignoring it", async () => {
		// forbidNonWhitelisted. A client that sends `role: "Admin"` to an endpoint
		// that never declared it gets a 400, not a silent privilege escalation.
		const res = await gql(app, CREATE, {
			payload: { email: "x@example.com", name: "X", isAdmin: true },
		});

		expect(res.errors).toBeDefined();
	});

	it("отклоняет запрос без service-token — дверь заперта", async () => {
		// Проверяем то, что реально стоит в проде: бэкенд отвечает только своим
		// сервисам. В TEST токен задан НЕ пустым намеренно — с пустым guard
		// выключается, и весь e2e зеленел бы, ни разу не пройдя через проверку.
		// Это ложный зелёный ровно того вида, который дороже всего.
		const res = await gqlWithoutServiceToken(
			app,
			"query { users(payload: { paginate: { skip: 0, take: 1 } }) { meta { total } } }",
		);

		expect(res.errors?.[0]?.message).toMatch(/service token/i);
		expect(res.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
	});

	it("rejects a request with no API key", async () => {
		const res = await gql(
			app,
			CREATE,
			{
				payload: { email: "y@example.com", name: "Y" },
			},
			"wrong-key",
		);

		expect(res.errors?.[0]?.message).toMatch(/invalid api key/i);
	});

	it("hides soft-deleted users from the list", async () => {
		const created = await gql<{ userCreate: { _id: string } }>(app, CREATE, {
			payload: { email: "gone@example.com", name: "Gone" },
		});
		const id = created.data!.userCreate._id;

		await gql(
			app,
			`mutation D($id: String!) { userDeactivate(id: $id) { _id } }`,
			{ id },
		);

		const list = await gql<{ users: { meta: { total: number } } }>(
			app,
			`query { users(payload: { paginate: { skip: 0, take: 25 } }) { meta { total } } }`,
		);

		expect(list.data?.users.meta.total).toBe(0);
	});
});
