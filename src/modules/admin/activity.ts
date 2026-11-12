import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";

/**
 * System activity log (UCM-D7). `record()` is fire-and-forget: audit logging
 * must never break the mutation it observes, so failures are swallowed after
 * being logged. The viewer + CSV export are admin-only.
 */

export interface ActivityEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  action: string;
  target: string;
  detail: string;
  createdAt: string;
}

interface LogDoc {
  _id: unknown;
  actorId: string;
  actorName: string;
  actorEmail: string;
  action: string;
  target: string;
  detail: string;
  createdAt: Date;
}

function toEntry(d: LogDoc & { _id: unknown }): ActivityEntry {
  return {
    id: String(d._id),
    actorId: d.actorId,
    actorName: d.actorName ?? "Unknown",
    actorEmail: d.actorEmail ?? "",
    action: d.action,
    target: d.target ?? "",
    detail: d.detail ?? "",
    createdAt: (d.createdAt ?? new Date()).toISOString(),
  };
}

/** Fire-and-forget audit write; never throws to the caller. */
export async function record(
  session: SessionForAuth | null,
  action: string,
  target: string,
  detail = "",
): Promise<void> {
  try {
    const user = (session?.user ?? {}) as { id?: string; name?: string; email?: string };
    await (await getDb()).collection("activity_logs").insertOne({
      actorId: user.id ?? "",
      actorName: user.name ?? "system",
      actorEmail: user.email ?? "",
      action,
      target,
      detail,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("[activity:record]", action, target, err);
  }
}

export const LOG_ACTIONS = [
  "user.approve",
  "user.suspend",
  "user.reactivate",
  "user.role",
  "user.verify",
  "user.import",
  "department.create",
  "department.update",
  "semester.create",
  "semester.update",
  "course.create",
  "course.update",
  "enrollment.override",
  "course.drop",
  "marks.publish",
  "announcement.create",
] as const;

export interface ActivityQuery {
  action?: string;
  search?: string;
  page?: number;
}

export const LOG_PAGE_SIZE = 30;

export async function listActivities(
  session: SessionForAuth | null,
  query: ActivityQuery = {},
): Promise<{ entries: ActivityEntry[]; total: number; page: number; pages: number }> {
  requireRole(session, ["admin"]);
  const db = await getDb();
  const filter: Record<string, unknown> = {};
  if (query.action && (LOG_ACTIONS as readonly string[]).includes(query.action)) {
    filter.action = query.action;
  }
  if (query.search?.trim()) {
    const re = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { actorName: { $regex: re, $options: "i" } },
      { actorEmail: { $regex: re, $options: "i" } },
      { target: { $regex: re, $options: "i" } },
    ];
  }
  const page = Math.max(1, query.page ?? 1);
  const total = await db.collection("activity_logs").countDocuments(filter);
  const docs = (await db
    .collection("activity_logs")
    .find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * LOG_PAGE_SIZE)
    .limit(LOG_PAGE_SIZE)
    .toArray()) as unknown as (LogDoc & { _id: unknown })[];
  return { entries: docs.map(toEntry), total, page, pages: Math.max(1, Math.ceil(total / LOG_PAGE_SIZE)) };
}

export async function recentActivities(
  session: SessionForAuth | null,
  limit = 8,
): Promise<ActivityEntry[]> {
  requireRole(session, ["admin"]);
  const docs = (await (await getDb())
    .collection("activity_logs")
    .find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()) as unknown as (LogDoc & { _id: unknown })[];
  return docs.map(toEntry);
}

export async function allActivities(
  session: SessionForAuth | null,
  query: ActivityQuery = {},
): Promise<ActivityEntry[]> {
  requireRole(session, ["admin"]);
  const db = await getDb();
  const filter: Record<string, unknown> = {};
  if (query.action && (LOG_ACTIONS as readonly string[]).includes(query.action)) {
    filter.action = query.action;
  }
  if (query.search?.trim()) {
    const re = query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { actorName: { $regex: re, $options: "i" } },
      { actorEmail: { $regex: re, $options: "i" } },
      { target: { $regex: re, $options: "i" } },
    ];
  }
  const docs = (await db
    .collection("activity_logs")
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(5000)
    .toArray()) as unknown as (LogDoc & { _id: unknown })[];
  return docs.map(toEntry);
}

/* ---------------------------------------------------------------- CSV (pure) */

/** Escape one CSV cell: quotes, commas, newlines; formula-injection guard. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function activitiesCsv(entries: ActivityEntry[]): string {
  const head = ["at (UTC)", "actor", "email", "action", "target", "detail"].map(csvCell).join(",");
  const rows = entries.map((e) =>
    [e.createdAt, e.actorName, e.actorEmail, e.action, e.target, e.detail].map(csvCell).join(","),
  );
  return [head, ...rows].join("\r\n");
}
