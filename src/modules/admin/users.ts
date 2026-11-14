import { hashPassword, generateRandomString } from "better-auth/crypto";
import { getDb } from "@/lib/db";
import { requireRole, type Role, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import type { ImportRow } from "@/modules/admin/csv";
import { record } from "@/modules/admin/activity";

/**
 * Admin user-management service (UCM-D2).
 * Every function takes the caller's session explicitly and re-checks RBAC —
 * a route guard alone is never trusted (Brain/ARCHITECTURE.md §5).
 */

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: Role;
  status: string;
  studentId?: string;
  departmentId?: string;
  createdAt: string;
};

export const PAGE_SIZE = 20;

interface UserDoc {
  _id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string;
  status: string;
  studentId: string;
  departmentId: string;
  createdAt: Date;
}

export async function listUsers(
  session: SessionForAuth | null,
  opts: { search?: string; status?: string; role?: string; page?: number },
): Promise<{ users: AdminUserRow[]; total: number; page: number; pages: number }> {
  requireRole(session, ["admin"]);
  const db = await getDb();
  const col = db.collection("user");

  type MongoFilter = Record<string, unknown>;
  const filter: MongoFilter = {};
  if (opts.search?.trim()) {
    const re = escapeRegex(opts.search.trim());
    filter.$or = [{ name: { $regex: re, $options: "i" } }, { email: { $regex: re, $options: "i" } }];
  }
  if (opts.status && ["active", "pending", "suspended"].includes(opts.status)) filter.status = opts.status;
  if (opts.role && ["admin", "teacher", "cr", "student", "alumni"].includes(opts.role)) filter.role = opts.role;

  const page = Math.max(1, opts.page ?? 1);
  const total = await col.countDocuments(filter);
  const docs = (await col
    .find(filter)
    .sort({ createdAt: -1, _id: 1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .toArray()) as unknown as (UserDoc & { _id: unknown })[];

  return {
    users: docs.map(
      (u): AdminUserRow => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        emailVerified: Boolean(u.emailVerified),
        role: (u.role as Role) ?? "student",
        status: u.status ?? "active",
        studentId: u.studentId || undefined,
        departmentId: u.departmentId || undefined,
        createdAt: (u.createdAt ?? new Date()).toISOString(),
      }),
    ),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/* ---------------------------------------------------------------- actions */

export type UserTransition = "approve" | "suspend" | "reactivate";

/** Strict state machine per PRD UCM-F1/D2: pending→active, active⇄suspended. */
export function nextStatus(current: string, transition: UserTransition): string | null {
  switch (transition) {
    case "approve":
      return current === "pending" ? "active" : null;
    case "suspend":
      return current === "active" || current === "pending" ? "suspended" : null;
    case "reactivate":
      return current === "suspended" ? "active" : null;
    default:
      return null;
  }
}

export async function transitionUser(
  session: SessionForAuth | null,
  email: string,
  transition: UserTransition,
): Promise<void> {
  requireRole(session, ["admin"]);

  const db = await getDb();
  const col = db.collection("user");
  const user = (await col.findOne({ email }, {
    projection: { status: 1, role: 1 },
  })) as { status: string; role: string } | null;
  if (!user) throw new AppError("NOT_FOUND", "User not found.");

  const target = nextStatus(user.status ?? "active", transition);
  if (!target) {
    throw new AppError("CONFLICT", `Can't ${transition} a user who is "${user.status}".`);
  }
  if (user.role === "admin" && transition === "suspend") {
    const admins = await col.countDocuments({ role: "admin", status: "active" });
    if (admins <= 1) throw new AppError("CONFLICT", "You cannot suspend the last active admin.");
  }

  await col.updateOne({ email }, { $set: { status: target } });
  await record(session, `user.${transition}`, email);
}

export async function setUserRole(
  session: SessionForAuth | null,
  email: string,
  role: Role,
): Promise<void> {
  // actorEmail must be read before requireRole narrows the session type.
  const actorEmail = (session?.user as { email?: string } | undefined)?.email ?? "";
  requireRole(session, ["admin"]);
  const db = await getDb();
  const col = db.collection("user");
  const user = await col.findOne({ email }, { projection: { role: 1 } });
  if (!user) throw new AppError("NOT_FOUND", "User not found.");
  if (email === actorEmail && user.role === "admin" && role !== "admin") {
    throw new AppError("CONFLICT", "You cannot change your own role out of admin.");
  }
  await col.updateOne({ email }, { $set: { role } });
  await record(session, "user.role", email, `role → ${role}`);
}

export async function markEmailVerified(session: SessionForAuth | null, email: string): Promise<void> {
  requireRole(session, ["admin"]);
  const db = await getDb();
  await db.collection("user").updateOne({ email }, { $set: { emailVerified: true } });
  await record(session, "user.verify", email);
}

/* ------------------------------------------------------------ bulk import */

export type ImportSummary = {
  imported: number;
  skipped: { index: number; reason: string }[];
  duplicatesInFile: number;
  existing: number;
};

/**
 * Bulk import (UCM-D2): inserts `user` docs + credential `account` docs with a
 * random temp password (hashed). New users sign in with email → "Set up
 * account" flow or admins provide a reset; design says imported accounts stay
 * `pending` until approved, mirroring self-registration rules.
 */
export async function importUsers(
  session: SessionForAuth | null,
  rows: ImportRow[],
): Promise<ImportSummary> {
  requireRole(session, ["admin"]);
  const db = await getDb();
  const userCol = db.collection("user");
  const accountCol = db.collection("account");

  const summary: ImportSummary = { imported: 0, skipped: [], duplicatesInFile: 0, existing: 0 };

  for (const row of rows) {
    const exists = await userCol.findOne({ email: row.email }, { projection: { _id: 1 } });
    if (exists) {
      summary.existing++;
      continue;
    }

    const now = new Date();
    const inserted = await userCol.insertOne({
      name: row.name,
      email: row.email,
      emailVerified: false,
      role: row.role,
      status: "pending",
      studentId: row.studentId || "",
      departmentId: "",
      createdAt: now,
      updatedAt: now,
    });

    // Credential account for BetterAuth logins — random temp password (user sets
    // their own via password reset, which requires email verification first).
    const password = generateRandomString(24);
    const passwordHash = await hashPassword(password);
    await accountCol.insertOne({
      userId: inserted.insertedId, // ObjectId — the mongo adapter coerces id/reference fields
      providerId: "credential",
      accountId: String(inserted.insertedId), // v1.7 sign-in matches accountId === user.id
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    summary.imported++;
  }

  await record(session, "user.import", `${summary.imported} accounts`, `${summary.existing} already existed`);
  return summary;
}
/* -------------------------------------------------------------- internals */

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
