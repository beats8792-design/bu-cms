import { MongoClient, type Db } from "mongodb";
import { serverEnv } from "@/lib/env";

/**
 * Server-only Mongo bootstrap. Globally cached (serverless + next dev safe).
 * Same connection is shared with BetterAuth for transaction support.
 */

export type MongoBundle = { client: MongoClient; db: Db };

const globalForMongo = globalThis as unknown as { __ucmsMongo?: Promise<MongoBundle> };

function target(): { uri: string; dbName: string } {
  const env = serverEnv();
  return { uri: env.MONGODB_URI, dbName: env.MONGODB_DB };
}

export async function createMongoClient(): Promise<MongoBundle> {
  globalForMongo.__ucmsMongo ??= (async () => {
    const { uri, dbName } = target();
    const client = await MongoClient.connect(uri, {
      appName: "ucms",
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5_000,
    });
    return { client, db: client.db(dbName) };
  })();
  return globalForMongo.__ucmsMongo;
}

export async function getDb(): Promise<Db> {
  const { db } = await createMongoClient();
  return db;
}
