import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import { AiError, aiConfigured, chat, extractJson } from "@/modules/ai/openrouter";
import { WeeklyPlanSchema, type StudyPlan } from "@/modules/ai/schema";
import { myCourseIds } from "@/modules/academic/enrollment";
import { listCourses } from "@/modules/academic/courses";
import { listEvents } from "@/modules/academic/calendar";
import { listAssignmentsByCourse } from "@/modules/assignments/service";
import { deadlineState } from "@/modules/assignments/schema";
import { listSessions } from "@/modules/attendance/service";

/**
 * Personalized study planner (UCM-A4): the student's enrolled courses +
 * upcoming assignment deadlines + exam calendar events + recently attended
 * session topics → one AI-generated weekly plan. One plan per user;
 * items are toggleable ("done") and the whole plan can be regenerated.
 */

interface PlanDoc {
  _id: unknown;
  userId: string;
  summary: string;
  items: Array<{ id: string; weekday: number; title: string; focus: string; minutes: number; courseCode: string; done: boolean }>;
  createdAt: Date;
}

function toPlan(d: PlanDoc & { _id: unknown }): StudyPlan {
  return {
    id: String(d._id),
    userId: d.userId,
    summary: d.summary ?? "",
    items: (d.items ?? []).map((i) => ({ ...i, id: i.id, done: Boolean(i.done) })),
    createdAt: (d.createdAt ?? new Date()).toISOString(),
  };
}

/** Weekly plan for the signed-in student/CR; null when none generated yet. */
export async function getPlan(session: SessionForAuth | null): Promise<StudyPlan | null> {
  requireRole(session, ["student", "cr"]);
  const user = session!.user as { id: string };
  const doc = (await (await getDb())
    .collection("study_plans")
    .findOne({ userId: user.id })) as (PlanDoc & { _id: unknown }) | null;
  return doc ? toPlan(doc) : null;
}

/** Toggle one plan item's done flag (owner only). */
export async function toggleItem(
  session: SessionForAuth | null,
  itemId: string,
  done: boolean,
): Promise<void> {
  requireRole(session, ["student", "cr"]);
  const user = session!.user as { id: string };
  const res = await (await getDb())
    .collection("study_plans")
    .updateOne({ userId: user.id, "items.id": itemId } as never, { $set: { "items.$.done": done } as never });
  if (res.matchedCount === 0) throw new AppError("NOT_FOUND", "Plan item not found.");
}

/** Build (or rebuild) the weekly plan from the user's real academic state. */
export async function generatePlan(session: SessionForAuth | null): Promise<StudyPlan> {
  requireRole(session, ["student", "cr"]);
  const user = session!.user as unknown as { id: string; name: string };
  if (!aiConfigured()) {
    throw new AiError("AI features are not configured yet — add OPENROUTER_API_KEY to the environment.", 503);
  }
  const db = await getDb();

  // 1) Enrolled courses with codes.
  const courseIds = await myCourseIds(session);
  const myCourses = (await listCourses(session)).filter((c) => courseIds.includes(c.id));
  if (myCourses.length === 0) {
    throw new AppError("CONFLICT", "Enroll in a course first — the planner builds your week from your enrollments.");
  }

  // 2) Upcoming deadlines (next 14 days) per course — `deadline` carries an
  //    explicit +06:00 offset so `new Date(iso)` is a correct instant.
  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 86_400_000);
  const deadlineLines: string[] = [];
  for (const course of myCourses) {
    const assignments = await listAssignmentsByCourse(session, course.id);
    for (const a of assignments) {
      const due = new Date(a.deadline);
      if (due >= now && due <= in14 && deadlineState(a.deadline) !== "closed") {
        deadlineLines.push(`${course.code}: "${a.title}" due ${a.deadline} (${a.points} pts)`);
      }
    }
  }

  // 3) Exam-type calendar events in the window (course- or dept-scoped are
  //    all fetched; course ones are matched by refId).
  const events = await listEvents(session, { upcomingOnly: true });
  const courseIdSet = new Set(myCourses.map((c) => c.id));
  const examLines = events
    .filter(
      (e) =>
        e.type === "exam" &&
        e.date <= in14.toISOString().slice(0, 10) &&
        (e.scope.type === "university" || courseIdSet.has(e.scope.refId)),
    )
    .map((e) => `${e.date}: ${e.title}`);

  // 4) Recently attended topics per course (last 3 sessions).
  const topicLines: string[] = [];
  for (const course of myCourses) {
    const sessions = (await listSessions(session, course.id)).slice(0, 3);
    const topics = sessions.map((s) => s.topic).filter(Boolean);
    if (topics.length > 0) topicLines.push(`${course.code}: ${topics.join(", ")}`);
  }

  const coursesLine = myCourses.map((c) => `${c.code} — ${c.title}`).join("; ");
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
  const weekdayHint = now.toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Dhaka" });

  const raw = await chat(
    [
      {
        role: "system",
        content:
          "You build realistic weekly study plans for university students (Bangladesh, week runs Sun–Thu, Fri/Sat are the weekend). " +
          "Answer with ONLY a JSON object: {\"summary\": string, \"items\": [{\"weekday\": 0-6 (Sun=0), \"title\": string, \"focus\": string, \"minutes\": 15-300, \"courseCode\": string}]}. " +
          "Prioritise nearest deadlines and exams, spread load across Sun–Thu, add short revision slots, keep 6–16 items total. courseCode must be one of the given codes (or \"\" for general study).",
      },
      {
        role: "user",
        content:
          `Today is ${weekdayHint} ${today} (Dhaka). Courses: ${coursesLine}\n\n` +
          `Deadlines in the next 14 days:\n${deadlineLines.length ? deadlineLines.join("\n") : "— none"}\n\n` +
          `Exam events in the window:\n${examLines.length ? examLines.join("\n") : "— none"}\n\n` +
          `Recently covered topics:\n${topicLines.length ? topicLines.join("\n") : "— unknown"}`,
      },
    ],
    { json: true, maxTokens: 3000 },
  );

  const parsed = WeeklyPlanSchema.safeParse(extractJson(raw));
  if (!parsed.success) {
    throw new AiError("The AI returned an unusable plan — try regenerating; it usually works on the second attempt.", 502);
  }

  // Replacing the plan resets done-flags — a fresh week is a fresh plan.
  const items = parsed.data.items.map((item, i) => ({ ...item, id: `i${i}`, done: false }));
  const savedAt = new Date();
  await db.collection("study_plans").updateOne(
    { userId: user.id },
    { $set: { userId: user.id, summary: parsed.data.summary, items, createdAt: savedAt } },
    { upsert: true },
  );
  const saved = (await db
    .collection("study_plans")
    .findOne({ userId: user.id })) as (PlanDoc & { _id: unknown }) | null;
  if (!saved) throw new AppError("INTERNAL", "Plan vanished after saving.");
  return toPlan(saved);
}
