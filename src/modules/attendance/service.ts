import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import {
  OpenSessionSchema,
  RosterSchema,
  buildDigest,
  attendanceStats,
  dhakaToday,
  type AttendanceRecord,
  type AttendanceSession,
  type AttendanceStatus,
  type StudentAttendanceRow,
} from "@/modules/attendance/schema";
import { toObjectId } from "@/modules/academic/model";
import type { CourseRow } from "@/modules/academic/courses";
import { ObjectId } from "mongodb";

/**
 * Attendance service (UCM-F15…F17). Authorization spine identical to
 * assignments/materials: manage = admin or assigned teacher; students/CRs
 * read their own numbers; CR additionally gets the section digest (UCM-R1).
 * Sessions are frozen when closed — reopening is a manager-only correction.
 */

interface SessionDoc {
  _id: unknown;
  courseId: string;
  section: string;
  date: string;
  topic: string;
  status: "open" | "closed";
  createdBy: string;
  closedAt: Date | null;
}

interface RecordDoc {
  _id: unknown;
  sessionId: string;
  userId: string;
  status: AttendanceStatus;
  markedAt: Date;
}

function toSession(d: SessionDoc & { _id: unknown }): AttendanceSession {
  return {
    id: String(d._id),
    courseId: d.courseId,
    section: d.section,
    date: d.date,
    topic: d.topic ?? "",
    status: d.status,
    createdBy: d.createdBy,
    closedAt: d.closedAt ? d.closedAt.toISOString() : null,
  };
}

function toRecord(d: RecordDoc & { _id: unknown }): AttendanceRecord {
  return {
    sessionId: d.sessionId,
    userId: d.userId,
    status: d.status,
    markedAt: (d.markedAt ?? new Date()).toISOString(),
  };
}

/* ------------------------------------------------------------- auth helpers */

async function loadCourse(
  courseId: string,
): Promise<CourseRow & { attendanceThreshold?: number }> {
  const db = await getDb();
  const doc = (await db.collection("courses").findOne({ _id: toObjectId(courseId) })) as
    | ({ _id: unknown; attendanceThreshold?: number } & CourseRow)
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Course not found.");
  return doc;
}

function isManager(course: CourseRow, session: SessionForAuth): boolean {
  const user = session.user as { id: string; role: string };
  return user.role === "admin" || course.teacherIds.includes(user.id);
}

async function loadSession(sessionId: string): Promise<{ doc: SessionDoc & { _id: unknown }; course: CourseRow }> {
  const db = await getDb();
  const doc = (await db
    .collection("attendance_sessions")
    .findOne({ _id: toObjectId(sessionId) })) as (SessionDoc & { _id: unknown }) | null;
  if (!doc) throw new AppError("NOT_FOUND", "Attendance session not found.");
  const course = await loadCourse(doc.courseId);
  return { doc, course };
}

/** Effective threshold: per-course override or the 75% default. */
export function courseThreshold(course: { attendanceThreshold?: number }): number {
  const t = course.attendanceThreshold;
  return typeof t === "number" && t >= 1 && t <= 100 ? t : 75;
}

/* ----------------------------------------------------------------- queries */

export async function listSessions(
  session: SessionForAuth | null,
  courseId: string,
): Promise<AttendanceSession[]> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const db = await getDb();
  const docs = (await db
    .collection("attendance_sessions")
    .find({ courseId })
    .sort({ date: -1, _id: -1 })
    .limit(200)
    .toArray()) as unknown as (SessionDoc & { _id: unknown })[];
  return docs.map(toSession);
}

export async function getSession(
  session: SessionForAuth | null,
  sessionId: string,
): Promise<AttendanceSession> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  return toSession((await loadSession(sessionId)).doc);
}

/** All marks for one session. Managers + CRs; students only see their own. */
export async function listSessionRecords(
  session: SessionForAuth | null,
  sessionId: string,
): Promise<AttendanceRecord[]> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  await loadSession(sessionId); // 404 check
  const db = await getDb();
  const docs = (await db
    .collection("attendance_records")
    .find({ sessionId })
    .toArray()) as unknown as (RecordDoc & { _id: unknown })[];
  return docs.map(toRecord);
}

/** One student's records for a course, joined with session dates/topics. */
export async function myAttendance(
  session: SessionForAuth | null,
  courseId: string,
  userId: string,
): Promise<{
  sessions: AttendanceSession[];
  records: AttendanceRecord[];
  stats: ReturnType<typeof attendanceStats>;
  threshold: number;
}> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const course = await loadCourse(courseId);
  const sessions = await listSessions(session, courseId);
  const db = await getDb();
  const sessionIds = sessions.map((s) => s.id);
  const recordDocs = sessionIds.length
    ? ((await db
        .collection("attendance_records")
        .find({ sessionId: { $in: sessionIds as unknown as ObjectId[] }, userId })
        .toArray()) as unknown as (RecordDoc & { _id: unknown })[])
    : [];
  const records = recordDocs.map(toRecord);
  const stats = attendanceStats(
    records.map((r) => r.status),
    sessions.map((s) => ({ id: s.id, section: s.section, closed: s.status === "closed" })),
    await mySection(courseId, userId),
    new Set(records.map((r) => r.sessionId)),
  );
  return { sessions, records, stats, threshold: courseThreshold(course) };
}

async function mySection(courseId: string, userId: string): Promise<string> {
  const row = (await (await getDb())
    .collection("enrollments")
    .findOne({ courseId, userId, status: "enrolled" }, { projection: { section: 1 } })) as
    | { section: string }
    | null;
  return row?.section ?? "A";
}

/**
 * Digest for a course (UCM-F17 + UCM-R1): full roster with stats, warnings
 * first. Teachers/admin get all sections; CRs are scoped to their section.
 */
export async function courseDigest(
  session: SessionForAuth | null,
  courseId: string,
): Promise<{ rows: StudentAttendanceRow[]; threshold: number; sessions: AttendanceSession[] }> {
  requireRole(session, ["admin", "teacher", "cr"]);
  const user = session!.user as { id: string; role: string };
  const course = await loadCourse(courseId);
  const isTeacherOrAdmin = user.role === "admin" || course.teacherIds.includes(user.id);

  const db = await getDb();
  const enrollFilter: Record<string, unknown> = { courseId, status: "enrolled" };
  if (!isTeacherOrAdmin) enrollFilter.section = await mySection(courseId, user.id);

  const enrollDocs = (await db
    .collection("enrollments")
    .find(enrollFilter)
    .toArray()) as unknown as Array<{ userId: string; section: string }>;

  const userIds = enrollDocs.map((e) => e.userId);
  const users = userIds.length
    ? ((await db
        .collection("user")
        .find({ _id: { $in: userIds as unknown as ObjectId[] } }, { projection: { name: 1, studentId: 1 } })
        .toArray()) as unknown as Array<{ _id: string; name: string; studentId?: string }>)
    : [];
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const sessions = await listSessions(session, courseId);
  const visibleSessions = isTeacherOrAdmin
    ? sessions
    : sessions.filter((s) => s.section === (enrollFilter.section as string));
  const sessionIds = visibleSessions.map((s) => s.id);

  const recordDocs = sessionIds.length
    ? ((await db
        .collection("attendance_records")
        .find({ sessionId: { $in: sessionIds as unknown as ObjectId[] } })
        .toArray()) as unknown as (RecordDoc & { _id: unknown })[])
    : [];

  const statusesByUser = new Map<string, AttendanceStatus[]>();
  const markedByUser = new Map<string, Set<string>>();
  for (const r of recordDocs) {
    const rec = toRecord(r);
    (statusesByUser.get(rec.userId) ?? statusesByUser.set(rec.userId, []).get(rec.userId)!).push(rec.status);
    (markedByUser.get(rec.userId) ?? markedByUser.set(rec.userId, new Set()).get(rec.userId)!).add(rec.sessionId);
  }

  const roster = enrollDocs.map((e) => ({
    userId: e.userId,
    name: userById.get(e.userId)?.name ?? "Unknown",
    studentId: userById.get(e.userId)?.studentId ?? "",
    section: e.section,
  }));

  return {
    rows: buildDigest(
      roster,
      statusesByUser,
      markedByUser,
      visibleSessions.map((s) => ({ id: s.id, section: s.section, closed: s.status === "closed" })),
      courseThreshold(course),
    ),
    threshold: courseThreshold(course),
    sessions: visibleSessions,
  };
}

/* ------------------------------------------------------------------ writes */

/** UCM-F15: open a session (course + section + Dhaka date + topic). */
export async function openSession(session: SessionForAuth | null, input: unknown): Promise<string> {
  requireRole(session, ["admin", "teacher"]);
  const parsed = OpenSessionSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);

  const course = await loadCourse(parsed.data.courseId);
  if (!isManager(course, session as SessionForAuth)) {
    throw new AppError("FORBIDDEN", "Only teachers of this course can take attendance.");
  }

  const db = await getDb();
  const inserted = await db.collection("attendance_sessions").insertOne({
    ...parsed.data,
    status: "open",
    createdBy: (session!.user as { id: string }).id,
    closedAt: null,
    createdAt: new Date(),
  });
  return String(inserted.insertedId);
}

/** Bulk upsert roster marks; open sessions only, enrolled students only. */
export async function saveRoster(
  session: SessionForAuth | null,
  sessionId: string,
  input: unknown,
): Promise<void> {
  requireRole(session, ["admin", "teacher"]);
  const parsed = RosterSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);

  const { doc, course } = await loadSession(sessionId);
  if (!isManager(course, session as SessionForAuth)) {
    throw new AppError("FORBIDDEN", "Only teachers of this course can edit attendance.");
  }
  if (doc.status !== "open") {
    throw new AppError("CONFLICT", "This session is closed — reopen it to edit.");
  }

  const db = await getDb();
  const wanted = [...new Set(parsed.data.marks.map((m) => m.userId))];
  const enrolled = (await db
    .collection("enrollments")
    .find({ courseId: doc.courseId, status: "enrolled", userId: { $in: wanted as unknown as ObjectId[] } }, { projection: { userId: 1 } })
    .toArray()) as unknown as { userId: string }[];
  const enrolledSet = new Set(enrolled.map((e) => e.userId));
  const unknown = wanted.filter((u) => !enrolledSet.has(u));
  if (unknown.length > 0) {
    throw new AppError("VALIDATION_FAILED", "Some marked students are not enrolled in this course.");
  }

  const markedBy = (session!.user as { id: string }).id;
  const ops = parsed.data.marks.map((m) => ({
    updateOne: {
      filter: { sessionId, userId: m.userId },
      update: { $set: { status: m.status, markedAt: new Date(), markedBy } },
      upsert: true,
    },
  }));
  await db.collection("attendance_records").bulkWrite(ops as never);
}

/** Close (freeze) or reopen a session — manager only. */
export async function setSessionClosed(
  session: SessionForAuth | null,
  sessionId: string,
  closed: boolean,
): Promise<void> {
  requireRole(session, ["admin", "teacher"]);
  const { course } = await loadSession(sessionId);
  if (!isManager(course, session as SessionForAuth)) {
    throw new AppError("FORBIDDEN", "Only teachers of this course can close or reopen sessions.");
  }
  await (await getDb()).collection("attendance_sessions").updateOne(
    { _id: toObjectId(sessionId) },
    {
      $set: { status: closed ? "closed" : "open", ...(closed ? { closedAt: new Date() } : { closedAt: null }) },
    },
  );
}

/** Per-course threshold override (UCM-F17 "configurable"); 1–100. */
export async function setCourseThreshold(
  session: SessionForAuth | null,
  courseId: string,
  value: number,
): Promise<void> {
  requireRole(session, ["admin", "teacher"]);
  const course = await loadCourse(courseId);
  if (!isManager(course, session as SessionForAuth)) {
    throw new AppError("FORBIDDEN", "Only teachers of this course can change the threshold.");
  }
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new AppError("VALIDATION_FAILED", "Threshold must be a whole number between 1 and 100.");
  }
  await (await getDb())
    .collection("courses")
    .updateOne({ _id: toObjectId(courseId) }, { $set: { attendanceThreshold: value } });
}

/** Default date for the open-session form (today in Dhaka). */
export function defaultSessionDate(): string {
  return dhakaToday();
}
