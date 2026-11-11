import { getDb } from "@/lib/db";
import { requireRole, type Role, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import {
  CourseSchema,
  findScheduleConflicts,
  type Course,
  type ScheduleSlot,
} from "@/modules/academic/schema";
import { ObjectId } from "mongodb";
import { toObjectId } from "@/modules/academic/model";

/**
 * Courses service (UCM-F6 + F9 schedule). Authorization model:
 * - admin: full CRUD anywhere;
 * - teacher: create in own dept + edit ONLY courses where teacherIds has them;
 * - students/CR/alumni: read via catalog functions (they never mutate here).
 */

interface CourseDoc {
  _id: unknown;
  code: string;
  title: string;
  credits: number;
  type: string;
  departmentId: string; // hex string of departments._id — simpler joins everywhere
  semesterId: string; // hex string of semesters._id
  teacherIds: string[]; // BetterAuth user ids (strings)
  seatLimit: number;
  syllabus: string;
  schedule: ScheduleSlot[];
}

export type CourseRow = Course & { teacherIds: string[] };

function toCourse(d: CourseDoc & { _id: unknown }): CourseRow {
  return {
    id: String(d._id),
    code: d.code,
    title: d.title,
    credits: d.credits,
    type: (d.type as "core" | "elective") ?? "core",
    departmentId: d.departmentId,
    semesterId: d.semesterId,
    teacherIds: d.teacherIds ?? [],
    seatLimit: d.seatLimit,
    syllabus: d.syllabus ?? "",
    schedule: d.schedule ?? [],
  };
}

const READ_ROLES: Role[] = ["admin", "teacher", "cr", "student", "alumni"];

export async function getCourse(session: SessionForAuth | null, id: string): Promise<CourseRow> {
  requireRole(session, READ_ROLES);
  const db = await getDb();
  const doc = (await db.collection("courses").findOne({ _id: toObjectId(id) })) as
    | (CourseDoc & { _id: unknown })
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Course not found.");
  return toCourse(doc);
}

export async function listCourses(
  session: SessionForAuth | null,
  opts: { semesterId?: string; departmentId?: string; mineOnly?: boolean } = {},
): Promise<CourseRow[]> {
  const sessionUser = session?.user as { id: string; role: Role } | undefined;
  requireRole(session, READ_ROLES);

  const filter: Record<string, unknown> = {};
  if (opts.semesterId) filter.semesterId = opts.semesterId;
  if (opts.departmentId) filter.departmentId = opts.departmentId;
  // Teachers asking for "mine" get only courses they teach.
  if (opts.mineOnly && sessionUser?.role === "teacher") {
    filter.teacherIds = sessionUser.id;
  }

  const db = await getDb();
  const docs = (await db
    .collection("courses")
    .find(filter)
    .sort({ code: 1 })
    .toArray()) as unknown as (CourseDoc & { _id: unknown })[];
  return docs.map(toCourse);
}

/** Counts enrolled students per course for the given course ids (seat meters). */
export async function countEnrolled(courseIds: string[]): Promise<Map<string, number>> {
  if (courseIds.length === 0) return new Map();
  const db = await getDb();
  const rows = await db
    .collection("enrollments")
    .aggregate([
      { $match: { courseId: { $in: courseIds }, status: "enrolled" } },
      { $group: { _id: "$courseId", count: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [String(r._id), Number(r.count)]));
}

/* ----------------------------------------------------------------- writes */

async function assertTeacherScoping(
  session: SessionForAuth,
  action: "create" | "update",
  target: { departmentId?: string; teacherIds?: string[] },
): Promise<void> {
  const role = (session.user as { role: string }).role as Role;
  if (role === "admin") return;
  if (role !== "teacher") throw new AppError("FORBIDDEN", "Only teachers and admins manage courses.");

  if (action === "create") {
    const teacherDept = (session.user as { departmentId?: string }).departmentId;
    if (!teacherDept || !target.departmentId || teacherDept !== target.departmentId) {
      throw new AppError("FORBIDDEN", "You can create courses only in your own department.");
    }
    return;
  }
  // Update: the caller must be an assigned teacher of that course.
  const teacherId = (session.user as { id: string }).id;
  if (!target.teacherIds?.includes(teacherId)) {
    throw new AppError("FORBIDDEN", "You can edit only courses you teach.");
  }
}

export async function createCourse(session: SessionForAuth | null, input: unknown): Promise<string> {
  requireRole(session, ["admin", "teacher"]);
  const parsed = CourseSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);
  await assertTeacherScoping(session as SessionForAuth, "create", parsed.data);

  const conflicts = findScheduleConflicts(parsed.data.schedule);
  if (conflicts.length > 0) throw new AppError("VALIDATION_FAILED", conflicts[0]);

  const db = await getDb();
  const dup = await db.collection("courses").findOne({
    code: parsed.data.code,
    semesterId: parsed.data.semesterId,
  });
  if (dup) throw new AppError("CONFLICT", `${parsed.data.code} already exists in this semester.`);

  const inserted = await db.collection("courses").insertOne({
    ...parsed.data,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return String(inserted.insertedId);
}

export async function updateCourse(
  session: SessionForAuth | null,
  id: string,
  input: unknown,
): Promise<void> {
  requireRole(session, ["admin", "teacher"]);
  const parsed = CourseSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);

  const db = await getDb();
  const doc = (await db.collection("courses").findOne({ _id: toObjectId(id) })) as
    | (CourseDoc & { _id: unknown })
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Course not found.");

  const role = (session?.user as { role: string }).role;
  if (role !== "admin") {
    // Teachers may edit everything EXCEPT teacher assignment (admin-only).
    await assertTeacherScoping(session as SessionForAuth, "update", { teacherIds: doc.teacherIds });
  }
  // Admin edit without explicit roster keeps the existing assignment.
  if (!parsed.data.teacherIds) parsed.data.teacherIds = doc.teacherIds;

  const conflicts = findScheduleConflicts(parsed.data.schedule);
  if (conflicts.length > 0) throw new AppError("VALIDATION_FAILED", conflicts[0]);

  const dup = await db.collection("courses").findOne({
    code: parsed.data.code,
    semesterId: parsed.data.semesterId,
    _id: { $ne: toObjectId(id) },
  });
  if (dup) throw new AppError("CONFLICT", `${parsed.data.code} already exists in this semester.`);

  await db.collection("courses").updateOne(
    { _id: toObjectId(id) },
    { $set: { ...parsed.data, updatedAt: new Date() } },
  );
}

/** Admin-only: assign/replace the teaching roster (input:false territory). */
export async function setCourseTeachers(
  session: SessionForAuth | null,
  courseId: string,
  teacherIds: string[],
): Promise<void> {
  requireRole(session, ["admin"]);
  if (teacherIds.length > 10) throw new AppError("VALIDATION_FAILED", "At most 10 teachers per course.");

  const db = await getDb();
  const res = await db.collection("courses").updateOne(
    { _id: toObjectId(courseId) },
    { $set: { teacherIds, updatedAt: new Date() } },
  );
  if (res.matchedCount === 0) throw new AppError("NOT_FOUND", "Course not found.");
}

/** Resolve teacher names for display (roster strip, timetable). */
export async function teacherNamesByIds(
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const db = await getDb();
  const docs = (await db
    .collection("user")
    // BetterAuth user ids are strings; driver typing assumes ObjectId.
    .find({ _id: { $in: ids as unknown as ObjectId[] } }, { projection: { name: 1 } })
    .toArray()) as unknown as { _id: string; name: string }[];
  return new Map(docs.map((d) => [String(d._id), d.name]));
}
