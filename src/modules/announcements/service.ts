import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import {
  canPostAnnouncement,
  canSeeAnnouncement,
  ComposeSchema,
  type Announcement,
  type AnnouncementScope,
  type ViewerContext,
} from "@/modules/announcements/schema";
import { myCourseIds, myEnrollment } from "@/modules/academic/enrollment";
import { toObjectId } from "@/modules/academic/model";
import type { CourseRow } from "@/modules/academic/courses";
import { notifyMany } from "@/modules/notifications/service";

/**
 * Announcements service (Phase 7, UCM-R2). Posting is gated pure-side
 * (`canPostAnnouncement`) and re-checked here against live enrollment data;
 * every post fans out notifications to its audience.
 */

interface AnnouncementDoc {
  _id: unknown;
  scope: AnnouncementScope;
  refId: string;
  section: string;
  title: string;
  body: string;
  pinned: boolean;
  authorId: string;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
}

function toAnnouncement(d: AnnouncementDoc & { _id: unknown }): Announcement {
  return {
    id: String(d._id),
    scope: d.scope,
    refId: d.refId,
    section: d.section ?? "",
    title: d.title,
    body: d.body,
    pinned: Boolean(d.pinned),
    authorId: d.authorId,
    authorName: d.authorName ?? "Unknown",
    createdAt: (d.createdAt ?? new Date()).toISOString(),
    updatedAt: (d.updatedAt ?? new Date()).toISOString(),
  };
}

async function loadCourseForAnnouncement(courseId: string): Promise<CourseRow> {
  const doc = (await (await getDb()).collection("courses").findOne({ _id: toObjectId(courseId) })) as
    | ({ _id: unknown } & CourseRow)
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Course not found.");
  return doc;
}

/** Viewer context for visibility filtering (roles + enrollment reality). */
export async function viewerContext(session: SessionForAuth): Promise<ViewerContext> {
  const user = session.user as { id: string; role: string; departmentId?: string };
  const db = await getDb();

  let taughtCourseIds: string[] = [];
  if (user.role === "teacher") {
    const docs = (await db
      .collection("courses")
      .find({ teacherIds: user.id }, { projection: { _id: 1 } })
      .toArray()) as unknown as Array<{ _id: unknown }>;
    taughtCourseIds = docs.map((d) => String(d._id));
  }

  const enrolledCourseIds = await myCourseIds(session);
  const sectionByCourse = new Map<string, string>();
  if (enrolledCourseIds.length > 0) {
    const rows = (await db
      .collection("enrollments")
      .find({ userId: user.id, status: "enrolled", courseId: { $in: enrolledCourseIds } }, { projection: { courseId: 1, section: 1 } })
      .toArray()) as unknown as Array<{ courseId: string; section: string }>;
    for (const r of rows) sectionByCourse.set(r.courseId, r.section);
  }

  return {
    role: user.role,
    departmentId: user.departmentId ?? "",
    enrolledCourseIds,
    taughtCourseIds,
    sectionByCourse,
  };
}

/* ------------------------------------------------------------------ queries */

/** Feed visible to the caller: pinned first, then newest. */
export async function listAnnouncements(
  session: SessionForAuth | null,
  opts: { limit?: number } = {},
): Promise<Announcement[]> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const user = session!.user as { id: string; role: string };

  if (user.role === "admin") {
    const docs = (await (await getDb())
      .collection("announcements")
      .find()
      .sort({ pinned: -1, createdAt: -1 })
      .limit(opts.limit ?? 50)
      .toArray()) as unknown as (AnnouncementDoc & { _id: unknown })[];
    return docs.map(toAnnouncement);
  }

  const ctx = await viewerContext(session as SessionForAuth);
  const scopeFilter: Array<Record<string, unknown>> = [
    { scope: "university" },
    ...(ctx.departmentId ? [{ scope: "department", refId: ctx.departmentId }] : []),
    ...(ctx.enrolledCourseIds.length > 0 ? [{ scope: "course", refId: { $in: ctx.enrolledCourseIds } }] : []),
    ...(ctx.taughtCourseIds.length > 0 ? [{ scope: "course", refId: { $in: ctx.taughtCourseIds } }] : []),
  ];
  const docs = (await (await getDb())
    .collection("announcements")
    .find({ $or: scopeFilter })
    .sort({ pinned: -1, createdAt: -1 })
    .limit(opts.limit ?? 50)
    .toArray()) as unknown as (AnnouncementDoc & { _id: unknown })[];

  // Section-scope filtering needs per-course sections; run the pure check.
  return docs
    .map(toAnnouncement)
    .filter((a) => canSeeAnnouncement(a, ctx))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
}

/** Courses the composer may announce to (for the form's picker). */
export async function composableCourses(
  session: SessionForAuth | null,
): Promise<Array<{ id: string; code: string; title: string; section: string }>> {
  requireRole(session, ["admin", "teacher", "cr"]);
  const user = session!.user as { id: string; role: string };
  const db = await getDb();

  if (user.role === "admin") {
    const docs = (await db
      .collection("courses")
      .find({}, { projection: { code: 1, title: 1 } })
      .sort({ code: 1 })
      .limit(200)
      .toArray()) as unknown as Array<{ _id: unknown; code: string; title: string }>;
    return docs.map((d) => ({ id: String(d._id), code: d.code, title: d.title, section: "" }));
  }

  let courseIds: string[] = [];
  if (user.role === "teacher") {
    const docs = (await db
      .collection("courses")
      .find({ teacherIds: user.id }, { projection: { code: 1, title: 1 } })
      .sort({ code: 1 })
      .toArray()) as unknown as Array<{ _id: unknown; code: string; title: string }>;
    return docs.map((d) => ({ id: String(d._id), code: d.code, title: d.title, section: "" }));
  }
  courseIds = await myCourseIds(session);
  const docs = courseIds.length
    ? ((await db
        .collection("courses")
        .find({ _id: { $in: courseIds.map((c) => toObjectId(c)) } }, { projection: { code: 1, title: 1 } })
        .sort({ code: 1 })
        .toArray()) as unknown as Array<{ _id: unknown; code: string; title: string }>)
    : [];
  const sections = new Map<string, string>();
  for (const c of courseIds) {
    const row = await myEnrollment(session, c);
    if (row) sections.set(c, row.section);
  }
  return docs.map((d) => ({
    id: String(d._id),
    code: d.code,
    title: d.title,
    section: sections.get(String(d._id)) ?? "A",
  }));
}

/* ------------------------------------------------------------------- writes */

/** UCM-R2: post + fan-out to the audience. */
export async function createAnnouncement(
  session: SessionForAuth | null,
  input: unknown,
): Promise<string> {
  requireRole(session, ["admin", "teacher", "cr"]);
  const parsed = ComposeSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);
  const { scope, refId, section, title, body } = parsed.data;

  const user = session!.user as { id: string; role: string; departmentId?: string; name: string };

  let isTeacherOfCourse = false;
  let isEnrolledCourse = false;
  let audience: string[] = [];
  let link = "/announcements";

  if (scope === "university") {
    const users = (await (await getDb())
      .collection("user")
      .find({ status: "active" }, { projection: { _id: 1 } })
      .toArray()) as unknown as Array<{ _id: string }>;
    audience = users.map((u) => String(u._id));
  } else if (scope === "department") {
    const users = (await (await getDb())
      .collection("user")
      .find({ status: "active", departmentId: refId }, { projection: { _id: 1 } })
      .toArray()) as unknown as Array<{ _id: string }>;
    audience = users.map((u) => String(u._id));
  } else {
    const course = await loadCourseForAnnouncement(refId);
    isTeacherOfCourse = course.teacherIds.includes(user.id);
    const enrollment = await (await getDb())
      .collection("enrollments")
      .findOne({ courseId: refId, userId: user.id, status: "enrolled" });
    isEnrolledCourse = Boolean(enrollment);

    const gate = canPostAnnouncement(scope, {
      role: user.role,
      isTeacherOfCourse,
      isEnrolledCourse,
      departmentId: user.departmentId ?? "",
    });
    if (!gate.ok) throw new AppError("FORBIDDEN", gate.reason);

    const enrollFilter: Record<string, unknown> = { courseId: refId, status: "enrolled" };
    if (scope === "section") enrollFilter.section = section;
    const students = (await (await getDb())
      .collection("enrollments")
      .find(enrollFilter, { projection: { userId: 1 } })
      .toArray()) as unknown as Array<{ userId: string }>;
    audience = [...students.map((s) => s.userId), ...course.teacherIds];
    link = `/courses/${refId}`;
  }

  const now = new Date();
  const inserted = await (await getDb()).collection("announcements").insertOne({
    scope,
    refId,
    section: scope === "section" ? section : "",
    title,
    body,
    pinned: false,
    authorId: user.id,
    authorName: user.name,
    createdAt: now,
    updatedAt: now,
  });

  if (audience.length > 0) {
    await notifyMany({
      userIds: audience.filter((u) => u !== user.id),
      type: "announcement",
      title: `${title}`,
      body: `New ${scope === "section" ? `section ${section}` : scope} announcement`,
      link,
    });
  }

  const { record } = await import("@/modules/admin/activity");
  await record(session, "announcement.create", `${scope}:${refId || ""}`, title);
  return String(inserted.insertedId);
}

export async function updateAnnouncement(
  session: SessionForAuth | null,
  announcementId: string,
  input: unknown,
): Promise<void> {
  requireRole(session, ["admin", "teacher", "cr"]);
  const user = session!.user as { id: string; role: string };
  const db = await getDb();
  const doc = (await db
    .collection("announcements")
    .findOne({ _id: toObjectId(announcementId) })) as (AnnouncementDoc & { _id: unknown }) | null;
  if (!doc) throw new AppError("NOT_FOUND", "Announcement not found.");
  if (user.role !== "admin" && doc.authorId !== user.id) {
    throw new AppError("FORBIDDEN", "Only the author or an admin can edit an announcement.");
  }

  const parsed = ComposeSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);
  // Scopes are immutable after posting (audience already fanned out).
  if (parsed.data.scope !== doc.scope || parsed.data.refId !== doc.refId) {
    throw new AppError("VALIDATION_FAILED", "Scope cannot change after posting.");
  }

  await db.collection("announcements").updateOne(
    { _id: toObjectId(announcementId) },
    {
      $set: {
        title: parsed.data.title,
        body: parsed.data.body,
        section: doc.scope === "section" ? parsed.data.section : "",
        updatedAt: new Date(),
      },
    },
  );
}

export async function setPinned(
  session: SessionForAuth | null,
  announcementId: string,
  pinned: boolean,
): Promise<void> {
  requireRole(session, ["admin", "teacher", "cr"]);
  const user = session!.user as { id: string; role: string };
  const doc = (await (await getDb())
    .collection("announcements")
    .findOne({ _id: toObjectId(announcementId) })) as (AnnouncementDoc & { _id: unknown }) | null;
  if (!doc) throw new AppError("NOT_FOUND", "Announcement not found.");
  if (user.role !== "admin" && doc.authorId !== user.id) {
    throw new AppError("FORBIDDEN", "Only the author or an admin can pin announcements.");
  }
  await (await getDb())
    .collection("announcements")
    .updateOne({ _id: toObjectId(announcementId) }, { $set: { pinned } });
}

export async function deleteAnnouncement(
  session: SessionForAuth | null,
  announcementId: string,
): Promise<void> {
  requireRole(session, ["admin", "teacher", "cr"]);
  const user = session!.user as { id: string; role: string };
  const doc = (await (await getDb())
    .collection("announcements")
    .findOne({ _id: toObjectId(announcementId) })) as (AnnouncementDoc & { _id: unknown }) | null;
  if (!doc) throw new AppError("NOT_FOUND", "Announcement not found.");
  if (user.role !== "admin" && doc.authorId !== user.id) {
    throw new AppError("FORBIDDEN", "Only the author or an admin can delete an announcement.");
  }
  await (await getDb())
    .collection("announcements")
    .deleteOne({ _id: toObjectId(announcementId) });
}
