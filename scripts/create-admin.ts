import { config } from "dotenv";
config({ path: ".env.local" });
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { hashPassword, generateRandomString } from "better-auth/crypto";
import { ObjectId, type WithId } from "mongodb";
import { createMongoClient } from "@/lib/db";

/**
 * `npm run adm <email>` — bootstrap the FIRST administrator.
 * Creates (or upgrades) a user to role=admin, status=active, emailVerified,
 * sets a random password you will reset on first sign-in.
 */

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.error("Usage: npm run adm -- you@versity.edu   (email required)");
    process.exit(1);
  }

  const { client, db } = await createMongoClient();
  try {
    const better = betterAuth({
      database: mongodbAdapter(db, { client }),
      baseURL: `${process.env.BETTERAUTH_URL?.replace(/\/$/, "")}/api/auth`,
      emailAndPassword: { enabled: true },
    });
    await better.$context; // ensures adapter indexes exist

    const users = db.collection("user");
    const accounts = db.collection("account");
    const now = new Date();
    const existing = await users.findOne({ email });

    if (existing) {
      await users.updateOne(
        { _id: existing._id },
        { $set: { role: "admin", status: "active", emailVerified: true } },
      );
      console.log("Existing user promoted to admin.");
      return;
    }

    const userDoc: WithId<Record<string, unknown>> = {
      _id: new ObjectId(),
      name: "Administrator",
      email,
      emailVerified: true,
      role: "admin",
      status: "active",
      displayName: "Administrator",
      departmentId: "",
      studentId: "",
      createdAt: now,
      updatedAt: now,
    };
    await users.insertOne(userDoc);

    const tempPassword = generateRandomString(32);
    await accounts.insertOne({
      userId: userDoc._id, // ObjectId — the mongo adapter coerces id/reference fields
      providerId: "credential",
      accountId: userDoc._id.toString(), // v1.7 sign-in matches accountId === user.id
      passwordHash: await hashPassword(tempPassword),
      createdAt: now,
      updatedAt: now,
    });
    console.log("Admin created. Use 'Forgot password' on /login to set your own password.");
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
