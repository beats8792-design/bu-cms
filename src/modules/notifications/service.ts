import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import {
  MarkReadSchema,
  reminderKey,
  labelForWindow,
  type Notification,
  type NotificationType,
  type ReminderWindow,
} from "@/modules/notifications/schema";
import { ObjectId } from "mongodb";

/**
 * Notifications service (Phase 7). Insert-many fan-out, per-recipient read
 * state. sendReminder dedupes on (refId, window) — stored inside each
 * notification doc as `dedup`, with a unique index making double-sends
 * impossible even under concurrent cron runs.
 */

interface NotificationDoc {
  _id: unknown;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  read: boolean;
  readAt: Date | null;
  dedup?: string;
  createdAt: Date;
}

function toNotification(d: NotificationDoc & { _id: unknown }): Notification & { id: string } {
  return {
    id: String(d._id),
    userId: d.userId,
    type: d.type,
    title: d.title,
    body: d.body ?? "",
    link: d.link ?? "/dashboard",
    read: Boolean(d.read),
    readAt: d.readAt ? d.readAt.toISOString() : null,
    createdAt: (d.createdAt ?? new Date()).toISOString(),
  };
}

/* ------------------------------------------------------------------ fan-out */

export interface NotifyInput {
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  /** Unique dedup key (e.g. "assignment:<id>:48h") — duplicates are dropped. */
  dedup?: string;
}

export async function notifyMany(input: NotifyInput): Promise<number> {
  const userIds = [...new Set(input.userIds)].filter(Boolean);
  if (userIds.length === 0) return 0;
  const db = await getDb();
  const now = new Date();
  try {
    const res = await db.collection("notifications").insertMany(
      userIds.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body ?? "",
        link: input.link ?? "/dashboard",
        read: false,
        readAt: null,
        ...(input.dedup ? { dedup: input.dedup } : {}),
        createdAt: now,
      })),
      { ordered: false },
    );
    return res.insertedCount;
  } catch (err) {
    // Duplicate-key errors from the dedup index are success for our purposes.
    if ((err as { code?: number }).code === 11000) return 0;
    throw err;
  }
}

/** UCM-F25 hook wrapper: results published for a course. */
export async function notifyResultsPublished(
  courseId: string,
  courseCode: string,
  userIds: string[],
): Promise<void> {
  await notifyMany({
    userIds,
    type: "results-published",
    title: `Results published — ${courseCode}`,
    body: "Your course results are now visible.",
    link: `/courses/${courseId}/marks`,
  });
}

/** One-shot per (refId, window): returns true when it was actually sent. */
export async function sendReminder(args: {
  userIds: string[];
  refId: string;
  window: ReminderWindow;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
}): Promise<boolean> {
  const res = await notifyMany({
    userIds: args.userIds,
    type: args.type,
    title: args.title,
    body: args.body,
    link: args.link,
    dedup: reminderKey(args.refId, args.window),
  });
  return res > 0;
}

export { labelForWindow };

/* ------------------------------------------------------------------- reads */

export async function listMine(
  session: SessionForAuth | null,
  opts: { limit?: number } = {},
): Promise<{ items: Array<Notification & { id: string }>; unread: number }> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const userId = (session!.user as { id: string }).id;
  const db = await getDb();
  const docs = (await db
    .collection("notifications")
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(opts.limit ?? 30)
    .toArray()) as unknown as (NotificationDoc & { _id: unknown })[];
  const unread = await db.collection("notifications").countDocuments({ userId, read: false });
  return { items: docs.map(toNotification), unread };
}

export async function markRead(session: SessionForAuth | null, input: unknown): Promise<number> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const parsed = MarkReadSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Bad request.");
  const userId = (session!.user as { id: string }).id;
  const db = await getDb();
  const filter: Record<string, unknown> = { userId, read: false };
  if (!parsed.data.all) {
    if (!parsed.data.ids?.length) return 0;
    filter._id = { $in: parsed.data.ids.map((id) => new ObjectId(id)) as unknown as ObjectId[] };
  }
  const res = await db.collection("notifications").updateMany(filter, {
    $set: { read: true, readAt: new Date() },
  });
  return res.modifiedCount;
}
