import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import {
  LibraryResourceSchema,
  canModerateLibrary,
  canUploadLibraryResource,
  type LibraryResource,
} from "@/modules/collab/schema";
import { materialDeliveryUrl } from "@/modules/shared/clients/cloudinary";
import { toObjectId } from "@/modules/academic/model";

/**
 * Senior resource library service (UCM-C2): past papers + guides tagged by
 * kind / department / course / semester, text-searchable browse, capped
 * download tracking. Moderation is optional (ROADMAP): uploads start
 * approved; admins can hide/show (`approved` flag).
 */

const DOWNLOAD_CAP = 500;

interface ResourceDoc {
  _id: unknown;
  title: string;
  description: string;
  kind: LibraryResource["kind"];
  departmentId: string;
  courseId: string;
  semesterId: string;
  uploaderId: string;
  approved: boolean;
  file: { publicId: string; fileName: string; size: number };
  downloads: Array<{ userId: string; at: Date }>;
  createdAt: Date;
}

function toResource(d: ResourceDoc & { _id: unknown }, uploaderName = "Unknown"): LibraryResource {
  return {
    id: String(d._id),
    title: d.title,
    description: d.description ?? "",
    kind: d.kind,
    departmentId: d.departmentId ?? "",
    courseId: d.courseId ?? "",
    semesterId: d.semesterId ?? "",
    uploaderId: d.uploaderId,
    uploaderName,
    approved: d.approved !== false,
    downloads: (d.downloads ?? []).length,
    createdAt: (d.createdAt ?? new Date()).toISOString(),
  };
}

/* ------------------------------------------------------------------ queries */

export interface LibraryQuery {
  q?: string;
  kind?: string;
  departmentId?: string;
  courseId?: string;
  semesterId?: string;
}

export async function listResources(
  session: SessionForAuth | null,
  query: LibraryQuery = {},
): Promise<LibraryResource[]> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const db = await getDb();
  const user = session!.user as { role: string };
  const filter: Record<string, unknown> = {};
  // Only admins see unapproved (hidden) resources.
  if (user.role !== "admin") filter.approved = true;
  if (query.kind) filter.kind = query.kind;
  if (query.departmentId) filter.departmentId = query.departmentId;
  if (query.courseId) filter.courseId = query.courseId;
  if (query.semesterId) filter.semesterId = query.semesterId;
  if (query.q) {
    filter.$text = { $search: query.q };
  }

  const docs = (await db
    .collection("library_resources")
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray()) as unknown as (ResourceDoc & { _id: unknown })[];

  const uploaderIds = [...new Set(docs.map((d) => d.uploaderId))];
  const users = uploaderIds.length
    ? ((await db
        .collection("user")
        .find({ _id: { $in: uploaderIds.map(toObjectId) } }, { projection: { name: 1 } })
        .toArray()) as unknown as Array<{ _id: string; name: string }>)
    : [];
  const nameById = new Map(users.map((u) => [String(u._id), u.name]));
  return docs.map((d) => toResource(d, nameById.get(d.uploaderId) ?? "Unknown"));
}

/* ------------------------------------------------------------------- writes */

export async function createResource(session: SessionForAuth | null, input: unknown): Promise<string> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const parsed = LibraryResourceSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);
  const user = session!.user as { id: string; role: string; name: string };
  if (!canUploadLibraryResource(user.role)) {
    throw new AppError("FORBIDDEN", "Signed-in members can contribute to the library.");
  }

  const inserted = await (await getDb()).collection("library_resources").insertOne({
    ...parsed.data,
    uploaderId: user.id,
    approved: true,
    downloads: [],
    createdAt: new Date(),
  });
  return String(inserted.insertedId);
}

export async function deleteResource(session: SessionForAuth | null, resourceId: string): Promise<void> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const user = session!.user as { id: string; role: string };
  const db = await getDb();
  const doc = (await db.collection("library_resources").findOne({ _id: toObjectId(resourceId) })) as
    | (ResourceDoc & { _id: unknown })
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Resource not found.");
  if (!canModerateLibrary(user.role, user.id, doc.uploaderId)) {
    throw new AppError("FORBIDDEN", "Only the uploader or an admin can delete a resource.");
  }
  await db.collection("library_resources").deleteOne({ _id: toObjectId(resourceId) });
}

/** Optional moderation: admin approve/hide. */
export async function setResourceApproved(
  session: SessionForAuth | null,
  resourceId: string,
  approved: boolean,
): Promise<void> {
  requireRole(session, ["admin"]);
  await (await getDb())
    .collection("library_resources")
    .updateOne({ _id: toObjectId(resourceId) }, { $set: { approved } });
}

/** RBAC (any signed-in active role) + capped tracking + delivery redirect. */
export async function resourceDownload(
  session: SessionForAuth | null,
  resourceId: string,
): Promise<string> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const user = session!.user as { id: string; role: string };
  const db = await getDb();
  const doc = (await db.collection("library_resources").findOne({ _id: toObjectId(resourceId) })) as
    | (ResourceDoc & { _id: unknown })
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Resource not found.");
  if (!doc.approved && user.role !== "admin") {
    throw new AppError("FORBIDDEN", "This resource is awaiting moderation.");
  }

  await db.collection("library_resources").updateOne(
    { _id: toObjectId(resourceId) },
    {
      $inc: { downloadCount: 1 },
      $push: { downloads: { $each: [{ userId: user.id, at: new Date() }], $slice: -DOWNLOAD_CAP } } as never,
    },
  );

  const safeName = doc.title.replace(/[^A-Za-z0-9._-]/g, "_");
  return materialDeliveryUrl(doc.file.publicId, safeName);
}
