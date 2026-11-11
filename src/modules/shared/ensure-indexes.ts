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
  "calendar_events",
] as const;

export async function ensureIndexes(db: Db): Promise<void> {
  for (const name of DOMAIN_COLLECTIONS) {
    const exists = await db.listCollections({ name }).hasNext();
    if (!exists) await db.createCollection(name);
  }

  /* departments: code is the human-facing identifier */
  await db.collection("departments").createIndex({ code: 1 }, { unique: true });
  /* courses: unique per (code, semesterId) — same course runs again next semester */
  await db.collection("courses").createIndex({ code: 1, semesterId: 1 }, { unique: true });
  await db.collection("courses").createIndex({ departmentId: 1, semesterId: 1 });
  await db.collection("courses").createIndex({ teacherIds: 1 });
  /* enrollments: one (course, user) row ever — dropped rows are reused */
  await db.collection("enrollments").createIndex({ courseId: 1, userId: 1 }, { unique: true });
  await db.collection("enrollments").createIndex({ userId: 1, status: 1 });
  /* calendar events: chronological lookups + scope lookups */
  await db.collection("calendar_events").createIndex({ date: 1 });
  await db.collection("calendar_events").createIndex({ "scope.type": 1, "scope.refId": 1 });
  /* assignments + submissions (Phase 4) */
  await db.collection("assignments").createIndex({ courseId: 1, deadlineAt: 1 });
  await db.collection("submissions").createIndex({ assignmentId: 1, userId: 1 }, { unique: true });
  await db.collection("submissions").createIndex({ userId: 1 });
  /* attendance (Phase 5) */
  await db.collection("attendance_sessions").createIndex({ courseId: 1, date: -1 });
  await db.collection("attendance_records").createIndex({ sessionId: 1, userId: 1 }, { unique: true });
  await db.collection("attendance_records").createIndex({ userId: 1 });

  await db.collection("meta").updateOne(
    { _id: "schema" } as never,
    { $setOnInsert: { createdAt: new Date(), schemaVersion: 0 } },
    { upsert: true },
  );
}
