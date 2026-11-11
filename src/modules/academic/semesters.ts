import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import { SemesterSchema, type Semester } from "@/modules/academic/schema";
import { toObjectId } from "@/modules/academic/model";

/**
 * Semesters service (UCM-F5). Admin-only writes. The enrollment-window flag
 * gates all self-enrollment (courses/enrollment.ts re-reads it, never trusts
 * the client).
 */

interface SemDoc {
  _id: unknown;
  academicYear: string;
  term: string;
  startDate: string;
  endDate: string;
  enrollmentOpen: boolean;
}

function toSemester(d: SemDoc & { _id: unknown }): Semester {
  return {
    id: String(d._id),
    academicYear: d.academicYear,
    term: d.term as Semester["term"],
    startDate: d.startDate,
    endDate: d.endDate,
    enrollmentOpen: Boolean(d.enrollmentOpen),
  };
}

export async function listSemesters(session: SessionForAuth | null): Promise<Semester[]> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const db = await getDb();
  const docs = (await db
    .collection("semesters")
    .find()
    .sort({ startDate: -1 })
    .toArray()) as unknown as (SemDoc & { _id: unknown })[];
  return docs.map(toSemester);
}

/** The semester currently accepting enrollments, if any (public to app roles). */
export async function getOpenSemester(session: SessionForAuth | null): Promise<Semester | null> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const db = await getDb();
  const doc = (await db.collection("semesters").findOne({ enrollmentOpen: true })) as
    | (SemDoc & { _id: unknown })
    | null;
  return doc ? toSemester(doc) : null;
}

export async function createSemester(session: SessionForAuth | null, input: unknown): Promise<void> {
  requireRole(session, ["admin"]);
  const parsed = SemesterSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);

  const db = await getDb();
  const dup = await db.collection("semesters").findOne({
    academicYear: parsed.data.academicYear,
    term: parsed.data.term,
  });
  if (dup) throw new AppError("CONFLICT", `${parsed.data.term} ${parsed.data.academicYear} already exists.`);

  await db.collection("semesters").insertOne({ ...parsed.data, createdAt: new Date(), updatedAt: new Date() });
}

export async function updateSemester(
  session: SessionForAuth | null,
  id: string,
  input: unknown,
): Promise<void> {
  requireRole(session, ["admin"]);
  const parsed = SemesterSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);

  const db = await getDb();
  const res = await db.collection("semesters").updateOne(
    { _id: toObjectId(id) },
    { $set: { ...parsed.data, updatedAt: new Date() } },
  );
  if (res.matchedCount === 0) throw new AppError("NOT_FOUND", "Semester not found.");
}

/** Window toggle is its own tiny action — it's the highest-traffic admin control. */
export async function setEnrollmentWindow(
  session: SessionForAuth | null,
  id: string,
  open: boolean,
): Promise<void> {
  requireRole(session, ["admin"]);
  const db = await getDb();
  const res = await db.collection("semesters").updateOne(
    { _id: toObjectId(id) },
    { $set: { enrollmentOpen: open, updatedAt: new Date() } },
  );
  if (res.matchedCount === 0) throw new AppError("NOT_FOUND", "Semester not found.");
}
