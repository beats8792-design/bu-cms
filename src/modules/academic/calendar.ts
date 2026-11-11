import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import { CalendarEventSchema, type CalendarEvent } from "@/modules/academic/schema";
import { toObjectId } from "@/modules/academic/model";

/**
 * Academic calendar events (UCM-F9): exams, holidays, notices.
 * Scope = university-wide, per department, or per course.
 */

interface EventDoc {
  _id: unknown;
  title: string;
  type: "exam" | "holiday" | "notice";
  date: string;
  scope: { type: "university" | "dept" | "course"; refId: string };
  description: string;
  createdBy: string;
}

export type ScopedEvent = CalendarEvent & { createdBy: string };

function toEvent(d: EventDoc & { _id: unknown }): ScopedEvent {
  return {
    id: String(d._id),
    title: d.title,
    type: d.type,
    date: d.date,
    scope: d.scope,
    description: d.description ?? "",
    createdBy: d.createdBy,
  };
}

export async function listEvents(
  session: SessionForAuth | null,
  opts: { scopeType?: "university" | "dept" | "course"; refId?: string; upcomingOnly?: boolean } = {},
): Promise<ScopedEvent[]> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const db = await getDb();
  const filter: Record<string, unknown> = {};
  if (opts.scopeType) filter["scope.type"] = opts.scopeType;
  if (opts.refId) filter["scope.refId"] = opts.refId;
  if (opts.upcomingOnly) filter.date = { $gte: new Date().toISOString().slice(0, 10) };

  const docs = (await db
    .collection("calendar_events")
    .find(filter)
    .sort({ date: 1 })
    .toArray()) as unknown as (EventDoc & { _id: unknown })[];
  return docs.map(toEvent);
}

export async function createEvent(session: SessionForAuth | null, input: unknown): Promise<void> {
  requireRole(session, ["admin", "teacher"]);
  const parsed = CalendarEventSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);
  if (parsed.data.scope.type !== "university" && !parsed.data.scope.refId) {
    throw new AppError("VALIDATION_FAILED", "Scoped events need the department or course they belong to.");
  }
  // Teachers may post course-scoped events only for courses they teach.
  const role = (session?.user as { role: string }).role;
  if (role === "teacher" && parsed.data.scope.type === "course") {
    const course = (await (await getDb()).collection("courses").findOne({
      _id: toObjectId(parsed.data.scope.refId),
    })) as { teacherIds?: string[] } | null;
    const teacherId = (session?.user as { id: string }).id;
    if (!course?.teacherIds?.includes(teacherId)) {
      throw new AppError("FORBIDDEN", "You can post events only for courses you teach.");
    }
  }

  await (await getDb()).collection("calendar_events").insertOne({
    ...parsed.data,
    createdBy: (session?.user as { id: string }).id,
    createdAt: new Date(),
  });
}

export async function deleteEvent(session: SessionForAuth | null, id: string): Promise<void> {
  requireRole(session, ["admin"]);
  const db = await getDb();
  await db.collection("calendar_events").deleteOne({ _id: toObjectId(id) });
}
