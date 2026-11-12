import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import { DepartmentSchema, type Department } from "@/modules/academic/schema";
import { toObjectId } from "@/modules/academic/model";
import { record } from "@/modules/admin/activity";

/**
 * Departments service (UCM-F4). Admin-only writes; every function re-checks
 * RBAC against the caller's session (Brain/ARCHITECTURE.md §5).
 */

interface DeptDoc {
  _id: unknown;
  code: string;
  name: string;
  headUserId?: string;
  programList?: string[];
}

export async function listDepartments(session: SessionForAuth | null): Promise<Department[]> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const db = await getDb();
  const docs = (await db
    .collection("departments")
    .find()
    .sort({ code: 1 })
    .toArray()) as unknown as (DeptDoc & { _id: unknown })[];
  return docs.map((d) => ({
    id: String(d._id),
    code: d.code,
    name: d.name,
    headUserId: d.headUserId || undefined,
    programList: d.programList ?? [],
  }));
}

export async function createDepartment(session: SessionForAuth | null, input: unknown): Promise<void> {
  requireRole(session, ["admin"]);
  const parsed = DepartmentSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);

  const db = await getDb();
  const exists = await db.collection("departments").findOne({ code: parsed.data.code });
  if (exists) throw new AppError("CONFLICT", `Department code "${parsed.data.code}" already exists.`);

  await db.collection("departments").insertOne({
    ...parsed.data,
    headUserId: "",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await record(session, "department.create", parsed.data.code, parsed.data.name);
}

export async function updateDepartment(
  session: SessionForAuth | null,
  id: string,
  input: unknown,
): Promise<void> {
  requireRole(session, ["admin"]);
  const parsed = DepartmentSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);

  const db = await getDb();
  const clash = await db.collection("departments").findOne({
    code: parsed.data.code,
    _id: { $ne: toObjectId(id) },
  });
  if (clash) throw new AppError("CONFLICT", `Department code "${parsed.data.code}" already exists.`);

  const res = await db.collection("departments").updateOne(
    { _id: toObjectId(id) },
    { $set: { ...parsed.data, updatedAt: new Date() } },
  );
  if (res.matchedCount === 0) throw new AppError("NOT_FOUND", "Department not found.");
  await record(session, "department.update", parsed.data.code);
}
