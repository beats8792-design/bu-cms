import type { Db } from "mongodb";

/**
 * Collection registry + idempotent index setup.
 * Each domain module owns its indexes after Phase 0; modules add entries here
 * as they land (see Brain/ARCHITECTURE.md §3 for the full map).
 */

/** Collections owned by domain modules (auth collections are BetterAuth's). */
export const DOMAIN_COLLECTIONS = [
  "departments",
  "semesters",
  "courses",
  "enrollments",
  "materials",
  "material_chunks",
  "assignments",
  "submissions",
  "attendance_sessions",
  "attendance_records",
  "assessment_schemas",
  "marks_entries",
  "results",
  "announcements",
  "notifications",
  "study_groups",
  "resource_library",
  "activity_logs",
] as const;

export async function ensureIndexes(db: Db): Promise<void> {
  for (const name of DOMAIN_COLLECTIONS) {
    const exists = await db.listCollections({ name }).hasNext();
    if (!exists) await db.createCollection(name);
  }

  await db.collection("meta").updateOne(
    { _id: "schema" } as never,
    { $setOnInsert: { createdAt: new Date(), schemaVersion: 0 } },
    { upsert: true },
  );
}
