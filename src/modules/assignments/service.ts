import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import {
  AssignmentSchema,
  canSubmit,
  mergeStatuses,
  validateScore,
  type Assignment,
  type LatePolicy,
  type RosterStudent,
  type Submission,
  type SubmissionFile,
} from "@/modules/assignments/schema";
import { toObjectId } from "@/modules/academic/model";
import type { CourseRow } from "@/modules/academic/courses";

/**
 * Assignments service (UCM-F10…F14). Same authorization spine as materials:
 * manage = admin or assigned teacher; submit = enrolled student/CR with the
 * pure gate; grade = manage.
 */

interface AssignmentDoc {
  _id: unknown;
  courseId: string;
  title: string;
  description: string;
  points: number;
  deadline: string;
  latePolicy: LatePolicy;
  attachments: Array<{ publicId: string; fileName: string; size: number }>;
  createdBy: string;
}

interface SubmissionDoc {
  _id: unknown;
  assignmentId: string;
  userId: string;
  files: SubmissionFile[];
  note: string;
  submittedAt: Date;
  isLate: boolean;
  score: number | null;
  feedback: string;
  gradedAt: Date | null;
  versionHistory: Submission["versionHistory"];
}

function toAssignment(d: AssignmentDoc & { _id: unknown }): Assignment {
  return {
    id: String(d._id),
    courseId: d.courseId,
    title: d.title,
    description: d.description ?? "",
    points: d.points,
    deadline: d.deadline,
    latePolicy: d.latePolicy ?? "allow",
    attachments: d.attachments ?? [],
    createdBy: d.createdBy,
  };
}

export function toSubmission(d: SubmissionDoc & { _id: unknown }): Submission {
  return {
    assignmentId: d.assignmentId,
    userId: d.userId,
    files: d.files ?? [],
    note: d.note ?? "",
    submittedAt: (d.submittedAt ?? new Date()).toISOString(),
    isLate: Boolean(d.isLate),
    score: d.score ?? null,
    feedback: d.feedback ?? "",
    gradedAt: d.gradedAt ? d.gradedAt.toISOString() : null,
    versionHistory: d.versionHistory ?? [],
  };
}

/* ------------------------------------------------------------- auth helpers */

async function loadCourse(courseId: string): Promise<CourseRow> {
  const db = await getDb();
  const doc = (await db.collection("courses").findOne({ _id: toObjectId(courseId) })) as
    | ({ _id: unknown } & CourseRow)
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Course not found.");
  return doc;
}

function isManager(course: CourseRow, session: SessionForAuth): boolean {
  const user = session.user as { id: string; role: string };
  return user.role === "admin" || course.teacherIds.includes(user.id);
}

async function isEnrolled(courseId: string, userId: string): Promise<boolean> {
  const row = await (await getDb())
    .collection("enrollments")
    .findOne({ courseId, userId, status: "enrolled" });
  return Boolean(row);
}

/* ------------------------------------------------------------------ queries */

export async function getAssignment(
  session: SessionForAuth | null,
  assignmentId: string,
): Promise<Assignment> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const db = await getDb();
  const doc = (await db.collection("assignments").findOne({ _id: toObjectId(assignmentId) })) as
    | (AssignmentDoc & { _id: unknown })
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Assignment not found.");
  return toAssignment(doc);
}

export async function listAssignmentsByCourse(
  session: SessionForAuth | null,
  courseId: string,
): Promise<Assignment[]> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const db = await getDb();
  const docs = (await db
    .collection("assignments")
    .find({ courseId })
    .sort({ deadlineAt: 1 })
    .toArray()) as unknown as (AssignmentDoc & { _id: unknown })[];
  return docs.map(toAssignment);
}

/** "Due soon" across a student's enrolled courses (UCM-F13), open first. */
export async function listDueAssignments(
  session: SessionForAuth | null,
  courseIds: string[],
  opts: { limit?: number } = {},
): Promise<Assignment[]> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  if (courseIds.length === 0) return [];
  const db = await getDb();
  const docs = (await db
    .collection("assignments")
    .find({
      courseId: { $in: courseIds },
      deadlineAt: { $gte: new Date() }, // stored instant — not the display string
    })
    .sort({ deadlineAt: 1 })
    .limit(opts.limit ?? 8)
    .toArray()) as unknown as (AssignmentDoc & { _id: unknown })[];
  return docs.map(toAssignment);
}

export async function mySubmission(
  session: SessionForAuth | null,
  assignmentId: string,
): Promise<Submission | null> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const userId = (session?.user as { id: string }).id;
  const db = await getDb();
  const doc = (await db.collection("submissions").findOne({ assignmentId, userId })) as
    | (SubmissionDoc & { _id: unknown })
    | null;
  return doc ? toSubmission(doc) : null;
}

/* -------------------------------------------------------------------- writes */

export async function createAssignment(session: SessionForAuth | null, input: unknown): Promise<string> {
  requireRole(session, ["admin", "teacher"]);
  const parsed = AssignmentSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);

  const course = await loadCourse(parsed.data.courseId);
  if (!isManager(course, session as SessionForAuth)) {
    throw new AppError("FORBIDDEN", "Only teachers of this course can create assignments.");
  }

  const db = await getDb();
  const inserted = await db.collection("assignments").insertOne({
    ...parsed.data,
    deadlineAt: new Date(parsed.data.deadline), // instant for range queries
    createdBy: (session!.user as { id: string }).id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return String(inserted.insertedId);
}

export async function updateAssignment(
  session: SessionForAuth | null,
  assignmentId: string,
  input: unknown,
): Promise<void> {
  requireRole(session, ["admin", "teacher"]);
  const db = await getDb();
  const doc = (await db.collection("assignments").findOne({ _id: toObjectId(assignmentId) })) as
    | (AssignmentDoc & { _id: unknown })
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Assignment not found.");

  const course = await loadCourse(doc.courseId);
  if (!isManager(course, session as SessionForAuth)) {
    throw new AppError("FORBIDDEN", "Only teachers of this course can edit assignments.");
  }

  const parsed = AssignmentSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);
  // courseId is immutable; the form re-sends it but it must match.
  if (parsed.data.courseId !== doc.courseId) {
    throw new AppError("VALIDATION_FAILED", "Course cannot be changed on an assignment.");
  }

  await db.collection("assignments").updateOne(
    { _id: toObjectId(assignmentId) },
    {
      $set: {
        ...parsed.data,
        deadlineAt: new Date(parsed.data.deadline), // instant for range queries
        updatedAt: new Date(),
      },
    },
  );
}

export async function deleteAssignment(session: SessionForAuth | null, assignmentId: string): Promise<void> {
  requireRole(session, ["admin", "teacher"]);
  const db = await getDb();
  const doc = (await db.collection("assignments").findOne({ _id: toObjectId(assignmentId) })) as
    | (AssignmentDoc & { _id: unknown })
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Assignment not found.");
  const course = await loadCourse(doc.courseId);
  if (!isManager(course, session as SessionForAuth)) {
    throw new AppError("FORBIDDEN", "Only teachers of this course can delete assignments.");
  }
  await db.collection("assignments").deleteOne({ _id: toObjectId(assignmentId) });
  await db.collection("submissions").deleteMany({ assignmentId });
}

/* ---------------------------------------------------------------- submission */

export interface SubmitArgs {
  assignmentId: string;
  userId: string;
  role: string;
  files: SubmissionFile[];
  note: string;
}

export async function submit(args: SubmitArgs): Promise<{ isLate: boolean }> {
  const db = await getDb();
  const doc = (await db.collection("assignments").findOne({ _id: toObjectId(args.assignmentId) })) as
    | (AssignmentDoc & { _id: unknown })
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Assignment not found.");

  const course = await loadCourse(doc.courseId);
  const decision = canSubmit({
    role: args.role,
    enrolled: await isEnrolled(course.id, args.userId),
    now: Date.now(),
    deadlineIso: doc.deadline,
    latePolicy: doc.latePolicy ?? "allow",
    hasFiles: args.files.length > 0,
  });
  if (!decision.ok) throw new AppError("CONFLICT", decision.reason);

  const existing = (await db.collection("submissions").findOne({
    assignmentId: args.assignmentId,
    userId: args.userId,
  })) as (SubmissionDoc & { _id: unknown }) | null;

  const now = new Date();
  if (existing) {
    // Versioning: current version moves into history (UCM-F11).
    await db.collection("submissions").updateOne(
      { _id: toObjectId(String(existing._id)) },
      {
        $set: {
          files: args.files,
          note: args.note,
          submittedAt: now,
          isLate: decision.isLate,
          updatedAt: now,
        },
        $push: {
          versionHistory: {
            at: existing.submittedAt.toISOString(),
            files: existing.files ?? [],
            note: existing.note ?? "",
            isLate: Boolean(existing.isLate),
          },
        } as never,
      },
    );
  } else {
    await db.collection("submissions").insertOne({
      assignmentId: args.assignmentId,
      userId: args.userId,
      files: args.files,
      note: args.note,
      submittedAt: now,
      isLate: decision.isLate,
      score: null,
      feedback: "",
      gradedAt: null,
      versionHistory: [],
      createdAt: now,
      updatedAt: now,
    });
  }
  return { isLate: decision.isLate };
}

export async function grade(
  session: SessionForAuth | null,
  assignmentId: string,
  studentUserId: string,
  score: number | null,
  feedback: string,
): Promise<void> {
  requireRole(session, ["admin", "teacher"]);
  const db = await getDb();
  const doc = (await db.collection("assignments").findOne({ _id: toObjectId(assignmentId) })) as
    | (AssignmentDoc & { _id: unknown })
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Assignment not found.");
  const course = await loadCourse(doc.courseId);
  if (!isManager(course, session as SessionForAuth)) {
    throw new AppError("FORBIDDEN", "Only teachers of this course can grade.");
  }
  if (score !== null) {
    const problem = validateScore(score, doc.points);
    if (problem) throw new AppError("VALIDATION_FAILED", problem);
  }

  const res = await db.collection("submissions").updateOne(
    { assignmentId, userId: studentUserId },
    {
      $set: {
        score,
        feedback: feedback.trim(),
        gradedAt: score === null ? null : new Date(),
      },
    },
  );
  if (res.matchedCount === 0) throw new AppError("NOT_FOUND", "No submission from that student yet.");
}

/* --------------------------------------------------------------- dashboards */

export async function teacherDashboard(
  session: SessionForAuth | null,
  assignmentId: string,
): Promise<{ assignment: Assignment; rows: ReturnType<typeof mergeStatuses>; submissions: Submission[] }> {
  requireRole(session, ["admin", "teacher"]);
  const assignment = await getAssignment(session, assignmentId);
  const course = await loadCourse(assignment.courseId);
  if (!isManager(course, session as SessionForAuth)) {
    throw new AppError("FORBIDDEN", "Only teachers of this course can view the grading dashboard.");
  }

  const db = await getDb();
  const rosterDocs = (await db
    .collection("enrollments")
    .find({ courseId: assignment.courseId, status: "enrolled" })
    .toArray()) as unknown as Array<{ userId: string; section: string }>;
  const userIds = rosterDocs.map((r) => r.userId);
  const users = userIds.length
    ? ((await db
        .collection("user")
        .find(
          { _id: { $in: userIds.map(toObjectId) } },
          { projection: { name: 1, studentId: 1 } },
        )
        .toArray()) as unknown as Array<{ _id: string; name: string; studentId?: string }>)
    : [];
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const roster: RosterStudent[] = rosterDocs.map((r) => ({
    userId: r.userId,
    name: userById.get(r.userId)?.name ?? "Unknown",
    studentId: userById.get(r.userId)?.studentId ?? "",
    section: r.section,
  }));

  const subDocs = (await db
    .collection("submissions")
    .find({ assignmentId })
    .toArray()) as unknown as (SubmissionDoc & { _id: unknown })[];
  const submissions = subDocs.map(toSubmission);

  return {
    assignment,
    rows: mergeStatuses(
      roster,
      submissions.map((s) => ({
        userId: s.userId,
        isLate: s.isLate,
        score: s.score,
        submittedAt: s.submittedAt,
      })),
      assignment.deadline,
    ),
    submissions,
  };
}

/** Cloudinary raw URLs for every submission file (download-all zip builder). */
export async function submissionFileUrls(
  assignmentId: string,
): Promise<Array<{ userId: string; fileName: string; url: string }>> {
  const db = await getDb();
  const docs = (await db
    .collection("submissions")
    .find({ assignmentId })
    .toArray()) as unknown as (SubmissionDoc & { _id: unknown })[];
  const { serverEnv } = await import("@/lib/env");
  const env = serverEnv();
  const base = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/raw/upload`;
  return docs.flatMap((d) =>
    (d.files ?? []).map((f) => ({
      userId: d.userId,
      fileName: `${d.userId}-${f.fileName}`,
      url: `${base}/${f.publicId}`,
    })),
  );
}
