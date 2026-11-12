import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import {
  canPinNote,
  canUploadNote,
  sortNotes,
  NoteSchema,
  type CourseNote,
} from "@/modules/collab/schema";
import { toObjectId } from "@/modules/academic/model";
import type { CourseRow } from "@/modules/academic/courses";
import { ObjectId } from "mongodb";
import { materialDeliveryUrl } from "@/modules/shared/clients/cloudinary";

/**
 * Course notes service (UCM-C1). Upload = browser-direct signed raw upload
 * (kind "note"); only metadata flows through the server actions. Downloads
 * tracked as a capped {userId, at} list; pin = teacher/admin supplement.
 */

const DOWNLOAD_CAP = 500;

interface NoteDoc {
  _id: unknown;
  courseId: string;
  uploaderId: string;
  title: string;
  file: CourseNote["file"];
  pinned: boolean;
  pinnedBy?: string;
  downloads: Array<{ userId: string; at: Date }>;
  createdAt: Date;
}

function toNote(d: NoteDoc & { _id: unknown }, uploaderName = "Unknown"): CourseNote {
  return {
    id: String(d._id),
    courseId: d.courseId,
    uploaderId: d.uploaderId,
    uploaderName,
    title: d.title,
    file: d.file,
    pinned: Boolean(d.pinned),
    downloads: (d.downloads ?? []).length,
    createdAt: (d.createdAt ?? new Date()).toISOString(),
  };
}

async function loadCourse(courseId: string): Promise<CourseRow> {
  const doc = (await (await getDb()).collection("courses").findOne({ _id: toObjectId(courseId) })) as
    | ({ _id: unknown } & CourseRow)
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Course not found.");
  return doc;
}

export async function isEnrolledIn(courseId: string, userId: string): Promise<boolean> {
  const row = await (await getDb())
    .collection("enrollments")
    .findOne({ courseId, userId, status: "enrolled" });
  return Boolean(row);
}

/* ------------------------------------------------------------------ queries */

export async function listNotes(
  session: SessionForAuth | null,
  courseId: string,
): Promise<CourseNote[]> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const db = await getDb();
  const docs = (await db
    .collection("course_notes")
    .find({ courseId })
    .sort({ pinned: -1, createdAt: -1 })
    .limit(100)
    .toArray()) as unknown as (NoteDoc & { _id: unknown })[];

  const uploaderIds = [...new Set(docs.map((d) => d.uploaderId))];
  const users = uploaderIds.length
    ? ((await db
        .collection("user")
        .find({ _id: { $in: uploaderIds as unknown as ObjectId[] } }, { projection: { name: 1 } })
        .toArray()) as unknown as Array<{ _id: string; name: string }>)
    : [];
  const nameById = new Map(users.map((u) => [String(u._id), u.name]));

  return sortNotes(docs.map((d) => toNote(d, nameById.get(d.uploaderId) ?? "Unknown")));
}

/* ------------------------------------------------------------------- writes */

export async function createNote(session: SessionForAuth | null, input: unknown): Promise<string> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const parsed = NoteSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);

  const user = session!.user as { id: string; role: string };
  const course = await loadCourse(parsed.data.courseId);
  const gate = canUploadNote({
    role: user.role,
    enrolled: await isEnrolledIn(parsed.data.courseId, user.id),
    isTeacherOfCourse: course.teacherIds.includes(user.id),
  });
  if (!gate.ok) throw new AppError("FORBIDDEN", gate.reason);

  const inserted = await (await getDb()).collection("course_notes").insertOne({
    ...parsed.data,
    uploaderId: user.id,
    pinned: false,
    downloads: [],
    createdAt: new Date(),
  });
  return String(inserted.insertedId);
}

export async function deleteNote(session: SessionForAuth | null, noteId: string): Promise<void> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const user = session!.user as { id: string; role: string };
  const db = await getDb();
  const doc = (await db.collection("course_notes").findOne({ _id: toObjectId(noteId) })) as
    | (NoteDoc & { _id: unknown })
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Note not found.");
  const course = await loadCourse(doc.courseId);
  const allowed =
    user.role === "admin" ||
    doc.uploaderId === user.id ||
    (user.role === "teacher" && course.teacherIds.includes(user.id));
  if (!allowed) throw new AppError("FORBIDDEN", "Only the uploader or the course teacher can delete a note.");
  await db.collection("course_notes").deleteOne({ _id: toObjectId(noteId) });
}

export async function setNotePinned(session: SessionForAuth | null, noteId: string, pinned: boolean): Promise<void> {
  requireRole(session, ["admin", "teacher"]);
  const user = session!.user as { id: string; role: string };
  const db = await getDb();
  const doc = (await db.collection("course_notes").findOne({ _id: toObjectId(noteId) })) as
    | (NoteDoc & { _id: unknown })
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Note not found.");
  const course = await loadCourse(doc.courseId);
  if (!canPinNote(user.role, course.teacherIds.includes(user.id))) {
    throw new AppError("FORBIDDEN", "Only teachers of this course can pin notes.");
  }
  await db
    .collection("course_notes")
    .updateOne({ _id: toObjectId(noteId) }, { $set: { pinned, pinnedBy: user.id } });
}

/** RBAC + tracking + 302 to the Cloudinary `fl_attachment` delivery URL. */
export async function noteDownload(
  session: SessionForAuth | null,
  noteId: string,
): Promise<{ redirectUrl: string; fileName: string }> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const user = session!.user as { id: string; role: string };
  const db = await getDb();
  const doc = (await db.collection("course_notes").findOne({ _id: toObjectId(noteId) })) as
    | (NoteDoc & { _id: unknown })
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Note not found.");

  const course = await loadCourse(doc.courseId);
  const isManager = user.role === "admin" || course.teacherIds.includes(user.id);
  if (!isManager && !(await isEnrolledIn(doc.courseId, user.id))) {
    throw new AppError("FORBIDDEN", "Enroll in this course to download notes.");
  }

  await db.collection("course_notes").updateOne(
    { _id: toObjectId(noteId) },
    {
      $inc: { downloadCount: 1 },
      $push: { downloads: { $each: [{ userId: user.id, at: new Date() }], $slice: -DOWNLOAD_CAP } } as never,
    },
  );

  const safeName = doc.file.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
  return { redirectUrl: materialDeliveryUrl(doc.file.publicId, safeName), fileName: safeName };
}
