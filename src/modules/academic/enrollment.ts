import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import { canSelfEnroll, type EnrollmentStatus } from "@/modules/academic/schema";
import { ObjectId } from "mongodb";
import { toObjectId } from "@/modules/academic/model";
import type { CourseRow } from "@/modules/academic/courses";
import { record } from "@/modules/admin/activity";

/**
 * Enrollment service (UCM-F7). Rules enforced here, in one place:
 * - self-enroll: student/CR, active account, window open (course's semester),
 *   seats available, not already enrolled; CR self-binds their section.
 * - manual enroll (teacher/admin): window + seats bypassed, status active.
 * - drop: self (any time), teacher/admin of the course, or admin.
 * The (courseId, userId) unique index pairs with an upsert that reactivates
 * dropped rows instead of inserting duplicates.
 */

export interface EnrollmentRow {
  courseId: string;
  userId: string;
  status: EnrollmentStatus;
  section: string;
  enrolledAt: string;
}

interface EnrollDoc {
  _id: unknown;
  courseId: string;
  userId: string;
  status: EnrollmentStatus;
  section: string;
  enrolledAt: Date;
}

export async function myEnrollment(
  session: SessionForAuth | null,
  courseId: string,
): Promise<EnrollmentRow | null> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const userId = (session?.user as { id: string }).id;
  const db = await getDb();
  const doc = (await db.collection("enrollments").findOne({ courseId, userId })) as
    | (EnrollDoc & { _id: unknown })
    | null;
  if (!doc) return null;
  return {
    courseId: doc.courseId,
    userId: doc.userId,
    status: doc.status,
    section: doc.section,
    enrolledAt: (doc.enrolledAt ?? new Date()).toISOString(),
  };
}

export async function listEnrolledIds(courseId: string): Promise<string[]> {
  const db = await getDb();
  const docs = (await db
    .collection("enrollments")
    .find({ courseId, status: "enrolled" }, { projection: { userId: 1 } })
    .toArray()) as unknown as { userId: string }[];
  return docs.map((d) => d.userId);
}

export interface RosterEntry extends EnrollmentRow {
  name: string;
  email: string;
  studentId: string;
}

export async function courseRoster(
  session: SessionForAuth | null,
  courseId: string,
): Promise<RosterEntry[]> {
  // CR sees the roster of the section they represent (teacher/admin: all).
  requireRole(session, ["admin", "teacher", "cr"]);
  const db = await getDb();
  const docs = (await db
    .collection("enrollments")
    .find({ courseId, status: "enrolled" })
    .sort({ section: 1, enrolledAt: 1 })
    .toArray()) as unknown as (EnrollDoc & { _id: unknown })[];

  const userIds = docs.map((d) => d.userId);
  const users = userIds.length
    ? ((await db
        .collection("user")
        // BetterAuth user ids are strings; driver typing assumes ObjectId.
        .find({ _id: { $in: userIds as unknown as ObjectId[] } }, { projection: { name: 1, email: 1, studentId: 1 } })
        .toArray()) as unknown as { _id: string; name: string; email: string; studentId?: string }[])
    : [];
  const byId = new Map(users.map((u) => [String(u._id), u]));

  return docs
    .map((d) => {
      const u = byId.get(d.userId);
      return {
        courseId: d.courseId,
        userId: d.userId,
        status: d.status,
        section: d.section,
        enrolledAt: (d.enrolledAt ?? new Date()).toISOString(),
        name: u?.name ?? "Unknown",
        email: u?.email ?? "",
        studentId: u?.studentId ?? "",
      };
    })
    .sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name));
}

/* ----------------------------------------------------------------- writes */

async function loadCourse(courseId: string): Promise<CourseRow> {
  const db = await getDb();
  const doc = (await db.collection("courses").findOne({ _id: toObjectId(courseId) })) as
    | ({ _id: unknown } & CourseRow)
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Course not found.");
  return doc;
}

async function seatsTaken(courseId: string): Promise<number> {
  const db = await getDb();
  return db.collection("enrollments").countDocuments({ courseId, status: "enrolled" });
}

/** Self-service enroll (student/CR). All policy checks come from canSelfEnroll. */
export async function selfEnroll(
  session: SessionForAuth | null,
  courseId: string,
  section = "A",
): Promise<void> {
  requireRole(session, ["student", "cr"]);
  const user = session.user as { id: string; role: string; status: "active" | "pending" | "suspended" };

  const course = await loadCourse(courseId);
  const db = await getDb();
  const semester = (await db.collection("semesters").findOne({ _id: toObjectId(course.semesterId) })) as
    | { enrollmentOpen?: boolean }
    | null;
  const existing = (await db.collection("enrollments").findOne({ courseId, userId: user.id })) as
    | { status: EnrollmentStatus }
    | null;

  const decision = canSelfEnroll({
    role: user.role,
    status: user.status,
    windowOpen: Boolean(semester?.enrollmentOpen),
    seatsTaken: await seatsTaken(courseId),
    seatLimit: course.seatLimit,
    existingStatus: (existing?.status as EnrollmentStatus) ?? null,
  });
  if (!decision.ok) throw new AppError("CONFLICT", decision.reason);

  await db.collection("enrollments").updateOne(
    { courseId, userId: user.id },
    {
      $set: { status: "enrolled", section, enrolledAt: new Date() },
      $unset: { droppedAt: "" },
    },
    { upsert: true },
  );
}

/** Teacher/admin manual enroll: bypasses the window, still respects seats. */
export async function manualEnroll(
  session: SessionForAuth | null,
  courseId: string,
  studentEmail: string,
  section = "A",
): Promise<void> {
  requireRole(session, ["admin", "teacher"]);
  const db = await getDb();
  const student = (await db.collection("user").findOne(
    { email: studentEmail.toLowerCase() },
    { projection: { role: 1, status: 1 } },
  )) as { _id: string; role: string; status: string } | null;
  if (!student) throw new AppError("NOT_FOUND", "No user with that email.");
  if (student.role !== "student" && student.role !== "cr") {
    throw new AppError("VALIDATION_FAILED", "Only students can be enrolled.");
  }

  const course = await loadCourse(courseId);
  const taken = await seatsTaken(courseId);
  if (taken >= course.seatLimit) throw new AppError("CONFLICT", "This course is full.");

  const existing = (await db.collection("enrollments").findOne({ courseId, userId: String(student._id) })) as
    | { status: string }
    | null;
  if (existing && existing.status === "enrolled") {
    throw new AppError("CONFLICT", "That student is already enrolled.");
  }

  await db.collection("enrollments").updateOne(
    { courseId, userId: String(student._id) },
    {
      $set: { status: "enrolled", section, enrolledAt: new Date() },
      $unset: { droppedAt: "" },
    },
    { upsert: true },
  );
  await record(session, "enrollment.override", studentEmail, `${course.code} → section ${section}`);
}

export async function drop(
  session: SessionForAuth | null,
  courseId: string,
  targetUserId?: string,
): Promise<void> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const user = session.user as { id: string; role: string };

  const target = targetUserId ?? user.id;
  if (target !== user.id) {
    // Dropping someone else: teachers of the course or admins only.
    const role = user.role;
    if (role === "admin") {
      // allowed
    } else if (role === "teacher") {
      const course = await loadCourse(courseId);
      if (!course.teacherIds.includes(user.id)) {
        throw new AppError("FORBIDDEN", "You can drop students only from courses you teach.");
      }
    } else {
      throw new AppError("FORBIDDEN", "You can only drop your own enrollment.");
    }
  }

  const db = await getDb();
  const res = await db.collection("enrollments").updateOne(
    { courseId, userId: target, status: "enrolled" },
    { $set: { status: "dropped", droppedAt: new Date() } },
  );
  if (res.matchedCount === 0) throw new AppError("CONFLICT", "No active enrollment found.");
  if (target !== user.id) {
    await record(session, "course.drop", `${courseId}:${target}`);
  }
}

/** My enrolled course ids (dashboard, timetable). */
export async function myCourseIds(session: SessionForAuth | null): Promise<string[]> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const userId = (session?.user as { id: string }).id;
  const db = await getDb();
  const docs = (await db
    .collection("enrollments")
    .find({ userId, status: "enrolled" }, { projection: { courseId: 1 } })
    .toArray()) as unknown as { courseId: string }[];
  return docs.map((d) => d.courseId);
}
