import { connect, disconnect, model, Schema } from "mongoose";
import { parseMongoUrl } from "../src/utils/url.util";

/**
 * Minimal seed so `pnpm local` has something to look at.
 *
 * A seed script is not a migration: it is idempotent, it only ever touches
 * development data, and it must be safe to run twice. Note the `upsert` — a
 * seed that throws on the second run is a seed nobody runs.
 */
const UserSchema = new Schema(
	{
		email: { type: String, unique: true },
		name: String,
		role: String,
		isActive: Boolean,
	},
	{ collection: "users", timestamps: true, versionKey: false },
);

async function main(): Promise<void> {
	const { uri, dbName } = parseMongoUrl(process.env.MONGODB_URL);
	if (!uri) throw new Error("MONGODB_URL is not set");

	await connect(uri, { dbName });

	const User = model("SeedUser", UserSchema);

	const users = [
		{ email: "admin@example.com", name: "Admin", role: "Admin" },
		{ email: "customer@example.com", name: "Customer", role: "Customer" },
	];

	for (const user of users) {
		await User.updateOne(
			{ email: user.email },
			{ $set: { ...user, isActive: true } },
			{ upsert: true },
		);
	}

	console.log(`seeded ${users.length} users into ${dbName}`);
	await disconnect();
}

main().catch((error) => {
	console.error("seed failed:", error);
	process.exit(1);
});
