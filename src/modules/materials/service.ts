import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import {
  MaterialSchema,
  groupByTopic,
  materialValidationError,
  normalizeTopic,
  type Material,
  type FileType,
} from "@/modules/materials/schema";
import { toObjectId } from "@/modules/academic/model";
import type { CourseRow } from "@/modules/academic/courses";

/**
 * Materials service (UCM-F8). Authorization:
 * - upload/edit/hide: admin, or a teacher assigned to the course;
 * - list/download: admin, teachers of the course, enrolled students/CRs,
 *   and alumni (read-only "published" access per PRD §5).
 */

interface MaterialDoc {
  _id: unknown;
  courseId: string;
  uploaderId: string;
  title: string;
  topic: string;
  description: string;
  cloudinaryPublicId: string;
  fileType: FileType;
  size: number;
  hidden: boolean;
  downloads: Array<{ userId: string; at: string }>;
  textContent?: string;
  extraction: { status: "pending" | "ok" | "empty" | "failed"; message: string };
  createdAt: Date;
  updatedAt: Date;
}

function toMaterial(d: MaterialDoc & { _id: unknown }, includeHidden: boolean): Material | null {
  if (d.hidden && !includeHidden) return null;
  return {
    id: String(d._id),
    courseId: d.courseId,
    uploaderId: d.uploaderId,
    title: d.title,
    topic: d.topic || "General",
    description: d.description ?? "",
    cloudinaryPublicId: d.cloudinaryPublicId,
    fileType: d.fileType,
    size: d.size,
    hidden: Boolean(d.hidden),
    downloadCount: d.downloads?.length ?? 0,
    extraction: d.extraction ?? { status: "pending", message: "" },
    createdAt: (d.createdAt ?? new Date()).toISOString(),
  };
}

/* ------------------------------------------------------------- authorization */

export async function loadCourseForMaterials(courseId: string): Promise<CourseRow> {
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

async function canAccessCourse(course: CourseRow, session: SessionForAuth): Promise<boolean> {
  const user = session.user as { id: string; role: string };
  if (user.role === "admin" || course.teacherIds.includes(user.id)) return true;
  if (user.role === "alumni") return true; // read-only published access
  // students/CRs must be enrolled
  const row = await (await getDb())
    .collection("enrollments")
    .findOne({ courseId: course.id, userId: user.id, status: "enrolled" });
  return Boolean(row);
}

/* ------------------------------------------------------------------- queries */

export async function listMaterials(
  session: SessionForAuth | null,
  courseId: string,
  opts: { includeHidden?: boolean } = {},
): Promise<Material[]> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const course = await loadCourseForMaterials(courseId);
  const includeHidden = opts.includeHidden === true && isManager(course, session);
  if (!(includeHidden || (await canAccessCourse(course, session)))) {
    throw new AppError("FORBIDDEN", "Enroll in this course to see its materials.");
  }

  const db = await getDb();
  const docs = (await db
    .collection("materials")
    .find({ courseId, hidden: includeHidden ? { $in: [true, false] } : false })
    .sort({ createdAt: -1 })
    .toArray()) as unknown as (MaterialDoc & { _id: unknown })[];
  return docs
    .map((d) => toMaterial(d, includeHidden))
    .filter((m): m is Material => m !== null);
}

/** Materials grouped per topic for the course page browser. */
export async function materialsByTopic(
  session: SessionForAuth | null,
  courseId: string,
): Promise<Map<string, Material[]>> {
  const materials = await listMaterials(session, courseId);
  return groupByTopic(materials);
}

/* -------------------------------------------------------------------- writes */

export interface CreateMaterialArgs {
  courseId: string;
  title: string;
  topic?: string;
  description?: string;
  cloudinaryPublicId: string;
  fileType: FileType;
  size: number;
  uploaderId: string;
  textContent?: string;
  extraction: { status: "ok" | "empty" | "failed"; message: string };
}

export async function createMaterial(args: CreateMaterialArgs): Promise<string> {
  const parsed = MaterialSchema.safeParse({
    courseId: args.courseId,
    title: args.title,
    topic: normalizeTopic(args.topic),
    description: args.description ?? "",
    cloudinaryPublicId: args.cloudinaryPublicId,
    fileType: args.fileType,
    size: args.size,
  });
  if (!parsed.success) throw materialValidationError(parsed.error.issues[0].message);

  const db = await getDb();
  const inserted = await db.collection("materials").insertOne({
    ...parsed.data,
    uploaderId: args.uploaderId,
    hidden: false,
    downloads: [],
    textContent: args.textContent ?? "",
    extraction: args.extraction,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return String(inserted.insertedId);
}

/** Only the uploader, an assigned teacher, or an admin may edit. */
export async function updateMaterial(
  session: SessionForAuth | null,
  materialId: string,
  patch: { title?: string; topic?: string; description?: string; hidden?: boolean },
): Promise<void> {
  requireRole(session, ["admin", "teacher"]);
  const db = await getDb();
  const doc = (await db.collection("materials").findOne({ _id: toObjectId(materialId) })) as
    | (MaterialDoc & { _id: unknown })
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Material not found.");

  const course = await loadCourseForMaterials(doc.courseId);
  const user = session.user as { id: string };
  if (user.id !== doc.uploaderId && !isManager(course, session)) {
    throw new AppError("FORBIDDEN", "Only the uploader or a course teacher can edit this material.");
  }

  const $set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) $set.title = patch.title;
  if (patch.description !== undefined) $set.description = patch.description;
  if (patch.topic !== undefined) $set.topic = normalizeTopic(patch.topic);
  if (patch.hidden !== undefined) $set.hidden = patch.hidden;
  await db.collection("materials").updateOne({ _id: toObjectId(materialId) }, { $set });
}

/** Soft delete = hide (analytics + audit keep the row). Hard delete: admin only. */
export async function hideMaterial(session: SessionForAuth | null, materialId: string): Promise<void> {
  await updateMaterial(session, materialId, { hidden: true });
}

export async function deleteMaterial(session: SessionForAuth | null, materialId: string): Promise<void> {
  requireRole(session, ["admin"]);
  const db = await getDb();
  await db.collection("materials").deleteOne({ _id: toObjectId(materialId) });
}

/* ------------------------------------------------------------------ download */

export async function registerDownload(
  session: SessionForAuth | null,
  materialId: string,
): Promise<void> {
  const userId = (session?.user as { id: string }).id;
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const db = await getDb();
  const doc = (await db.collection("materials").findOne({ _id: toObjectId(materialId) })) as
    | (MaterialDoc & { _id: unknown })
    | null;
  if (!doc || doc.hidden) throw new AppError("NOT_FOUND", "Material not found.");

  const course = await loadCourseForMaterials(doc.courseId);
  if (!(await canAccessCourse(course, session as SessionForAuth))) {
    throw new AppError("FORBIDDEN", "Enroll in this course to download its materials.");
  }

  // Cap the array; the count is derived from it (ARCHITECTURE.md §3 downloads[]).
  const entry = { userId, at: new Date().toISOString() };
  await db.collection("materials").updateOne(
    { _id: toObjectId(materialId) },
    { $push: { downloads: { $each: [entry], $slice: -5000 } } as never },
  );
}
