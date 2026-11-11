import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { dueWindows, labelForWindow, type ReminderWindow } from "@/modules/notifications/schema";
import { notifyMany, sendReminder } from "@/modules/notifications/service";
import { dhakaToday } from "@/modules/attendance/schema";
import { toObjectId } from "@/modules/academic/model";
import { ObjectId } from "mongodb";

/**
 * GET /api/cron/reminders — Vercel Cron entry (hourly per vercel.json).
 * Protected by `Authorization: Bearer <CRON_SECRET>` (set the secret in
 * Vercel env). Idempotent:
 *  - assignment deadline reminders T-48h/T-24h/T-2h, deduped per window via
 *    a `reminders` set on the assignment doc + a unique (dedup, userId)
 *    notification index (double-send impossible even on overlapping runs)
 *  - exam-schedule notices for calendar events dated within 2 days,
 *    flagged `notified` on the event doc
 */

interface AssignmentDoc {
  _id: unknown;
  courseId: string;
  title: string;
  deadlineAt: Date;
  reminders?: string[];
}

interface ExamEventDoc {
  _id: unknown;
  title: string;
  date: string;
  description: string;
  scope: { type: "university" | "dept" | "course"; refId: string };
}

function dhakaDatePlus(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(d);
}

export async function GET(request: Request) {
  const env = serverEnv();
  const secret = env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const db = await getDb();
    const now = new Date();
    const sent: string[] = [];

    /* Assignment deadline reminders (UCM-F25 / Phase 7) */
    const horizon = new Date(now.getTime() + 48 * 3_600_000);
    const assignments = (await db
      .collection("assignments")
      .find({ deadlineAt: { $gt: now, $lte: horizon } })
      .toArray()) as unknown as (AssignmentDoc & { _id: unknown })[];

    for (const a of assignments) {
      const windows = dueWindows(new Date(a.deadlineAt), now);
      const already = new Set(a.reminders ?? []);
      const enrolled = (await db
        .collection("enrollments")
        .find({ courseId: a.courseId, status: "enrolled" }, { projection: { userId: 1 } })
        .toArray()) as unknown as Array<{ userId: string }>;
      const userIds = enrolled.map((e) => e.userId);

      for (const w of windows as ReminderWindow[]) {
        if (already.has(`${w}h`)) continue;
        const ok = await sendReminder({
          userIds,
          refId: String(a._id),
          window: w,
          type: "assignment-deadline",
          title: `Due ${labelForWindow(w)} — ${a.title}`,
          body: "Wrap up and submit before the deadline.",
          link: `/courses/${a.courseId}/assignments/${String(a._id)}`,
        });
        if (ok) {
          sent.push(`${String(a._id).slice(-6)}:${w}h × ${userIds.length}`);
          await db
            .collection("assignments")
            .updateOne({ _id: toObjectId(String(a._id)) }, { $addToSet: { reminders: `${w}h` } });
        }
      }
    }

    /* Exam-schedule notices */
    const exams = (await db
      .collection("calendar_events")
      .find({
        type: "exam",
        date: { $gte: dhakaToday(), $lte: dhakaDatePlus(2) },
        notified: { $ne: true },
      })
      .toArray()) as unknown as (ExamEventDoc & { _id: unknown })[];

    for (const ev of exams) {
      let audience: string[] = [];
      if (ev.scope.type === "course") {
        const enrolled = (await db
          .collection("enrollments")
          .find({ courseId: ev.scope.refId, status: "enrolled" }, { projection: { userId: 1 } })
          .toArray()) as unknown as Array<{ userId: string }>;
        audience = enrolled.map((e) => e.userId);
      } else if (ev.scope.type === "dept") {
        const users = (await db
          .collection("user")
          .find({ status: "active", departmentId: ev.scope.refId }, { projection: { _id: 1 } })
          .toArray()) as unknown as Array<{ _id: string }>;
        audience = users.map((u) => String(u._id));
      } else {
        const users = (await db
          .collection("user")
          .find({ status: "active" }, { projection: { _id: 1 } })
          .toArray()) as unknown as Array<{ _id: string }>;
        audience = users.map((u) => String(u._id));
      }

      if (audience.length > 0) {
        await notifyMany({
          userIds: audience,
          type: "exam-schedule",
          title: `Exam: ${ev.title}`,
          body: `Scheduled for ${ev.date} (Asia/Dhaka).`,
          link: "/calendar",
        });
      }
      await db
        .collection("calendar_events")
        .updateOne({ _id: new ObjectId(String(ev._id)) as unknown as ObjectId }, { $set: { notified: true } });
      sent.push(`exam:${ev.title.slice(0, 30)} × ${audience.length}`);
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    console.error("[cron:reminders]", err);
    return NextResponse.json({ error: "Reminder run failed." }, { status: 500 });
  }
}
