import { createMongoClient } from "@/lib/db";
import { ensureIndexes } from "@/modules/shared/ensure-indexes";

/**
 * `npm run db:setup` — run once after creating an Atlas cluster (and again
 * whenever a new phase registers new indexes).
 */

async function main(): Promise<void> {
  const { client, db } = await createMongoClient();
  await ensureIndexes(db);

  const collections = (await db.listCollections().toArray()).map((c) => c.name).sort();
  console.log("Collections ready:");
  for (const name of collections) console.log(`  • ${name}`);
  console.log("Indexes ensured. Done.");

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
