import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { createMongoClient } from "@/lib/db";

/**
 * BetterAuth is built against the same MongoClient as domain data so
 * transactions are available (Atlas replica set).
 *
 * ID strategy (see Brain/ARCHITECTURE.md §4):
 * - BetterAuth keeps its default string ids on user/session/account/verification.
 * - Domain documents store `userId: string`; never join into auth collections.
 */

const globalForAuth = globalThis as unknown as {
  __ucmsAuth?: ReturnType<typeof createAuth>;
};

function createAuth() {
  const mongo = createMongoClient();
  return mongo.then(({ client, db }) =>
    betterAuth({
      database: mongodbAdapter(db, { client }),
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: false, // flips on in Phase 1 with Resend
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // refresh daily
      },
      user: {
        additionalFields: {
          role: {
            type: "string",
            defaultValue: "student",
            required: false,
            input: false, // set server-side only (registration/approval), never from client
          },
          displayName: { type: "string", required: false, input: true },
          departmentId: { type: "string", required: false, input: false },
          studentId: { type: "string", required: false, input: false },
          status: {
            type: "string",
            defaultValue: "active",
            required: false,
            input: false, // active | pending | suspended, managed by admin flows (Phase 1)
          },
        },
      },
      advanced: {
        database: {
          joins: true,
        },
      },
      rateLimit: {
        enabled: true,
        window: 60, // seconds
        max: 30, // per window; auth endpoints get their own stricter limits via auth API config later
      },
    }),
  );
}

export async function getAuth() {
  globalForAuth.__ucmsAuth ??= createAuth();
  return globalForAuth.__ucmsAuth;
}
