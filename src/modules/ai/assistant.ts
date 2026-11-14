import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import { AiError, aiConfigured, chat } from "@/modules/ai/gemini";
import {
  AskSchema,
  MIN_ASK_GAP_SECONDS,
  dailyQuotaFor,
  startOfDhakaDay,
  withinRateLimit,
  type AssistantMessage,
} from "@/modules/ai/schema";
import { retrieve } from "@/modules/ai/rag";
import { toObjectId } from "@/modules/academic/model";
import { isEnrolledIn } from "@/modules/collab/notes";
import type { CourseRow } from "@/modules/academic/courses";

/**
 * AI Course Assistant (UCM-A1): per-course chat grounded in the course's
 * indexed material chunks, with [n] citations. Quotas per role per Dhaka day
 * + a minimum gap between asks. Messages persist per (course, user) thread.
 */

interface MessageDoc {
  _id: unknown;
  courseId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  citations: Array<{ materialId: string; title: string; part: number }>;
  createdAt: Date;
}

function toMessage(d: MessageDoc & { _id: unknown }): AssistantMessage {
  return {
    id: String(d._id),
    role: d.role,
    content: d.content,
    citations: d.citations ?? [],
    createdAt: (d.createdAt ?? new Date()).toISOString(),
  };
}

export async function listThread(
  session: SessionForAuth | null,
  courseId: string,
): Promise<AssistantMessage[]> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const user = session!.user as { id: string };
  const docs = (await (await getDb())
    .collection("assistant_messages")
    .find({ courseId, userId: user.id })
    .sort({ createdAt: 1 })
    .limit(100)
    .toArray()) as unknown as (MessageDoc & { _id: unknown })[];
  return docs.map(toMessage);
}

export interface QuotaState {
  used: number;
  quota: number;
  secondsUntilNextAsk: number;
}

export async function quotaState(
  session: SessionForAuth | null,
  courseId: string,
): Promise<QuotaState> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const user = session!.user as { id: string; role: string };
  const db = await getDb();
  const today = await db
    .collection("assistant_messages")
    .countDocuments({ courseId, userId: user.id, role: "user", createdAt: { $gte: startOfDhakaDay() } });
  const last = (await db
    .collection("assistant_messages")
    .findOne(
      { courseId, userId: user.id, role: "user" },
      { sort: { createdAt: -1 }, projection: { createdAt: 1 } },
    )) as { createdAt: Date } | null;
  const elapsed = last ? (Date.now() - new Date(last.createdAt).getTime()) / 1000 : Infinity;
  return {
    used: today,
    quota: dailyQuotaFor(user.role),
    secondsUntilNextAsk: Math.max(0, Math.ceil(MIN_ASK_GAP_SECONDS - elapsed)),
  };
}

/** Access gate: managers + enrolled students/CRs. */
async function canUse(session: SessionForAuth, course: CourseRow, userId: string, role: string): Promise<boolean> {
  if (role === "admin" || course.teacherIds.includes(userId)) return true;
  if (role === "student" || role === "cr") return isEnrolledIn(course.id, userId);
  return false;
}

export async function ask(
  session: SessionForAuth | null,
  courseId: string,
  input: unknown,
): Promise<{ answer: AssistantMessage; quota: QuotaState }> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const parsed = AskSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);
  const user = session!.user as { id: string; role: string; name: string };
  const db = await getDb();

  const course = (await db.collection("courses").findOne({ _id: toObjectId(courseId) })) as
    | ({ _id: unknown } & CourseRow)
    | null;
  if (!course) throw new AppError("NOT_FOUND", "Course not found.");
  if (!(await canUse(session!, course, user.id, user.role))) {
    throw new AppError("FORBIDDEN", "Only the course's members can use the assistant.");
  }
  if (!aiConfigured()) {
    throw new AiError("AI features are not configured yet — add GEMINI_API_KEY to the environment.", 503);
  }

  // Quota (per Dhaka day) + minimum gap between asks.
  const used = await db
    .collection("assistant_messages")
    .countDocuments({
      courseId,
      userId: user.id,
      role: "user",
      createdAt: { $gte: startOfDhakaDay() },
    });
  const quota = dailyQuotaFor(user.role);
  if (used >= quota) {
    throw new AppError("RATE_LIMITED", `You've used all ${quota} questions for today — the counter resets at midnight (Dhaka).`);
  }
  const lastAsk = (await db
    .collection("assistant_messages")
    .findOne({ courseId, userId: user.id, role: "user" }, { sort: { createdAt: -1 }, projection: { createdAt: 1 } })) as
    | { createdAt: Date }
    | null;
  if (!withinRateLimit(lastAsk ? new Date(lastAsk.createdAt).toISOString() : null)) {
    throw new AppError("RATE_LIMITED", `Please wait ${MIN_ASK_GAP_SECONDS}s between questions.`);
  }

  // Retrieval + grounded generation.
  const chunks = await retrieve(courseId, parsed.data.question, 6);
  if (chunks.length === 0) {
    throw new AppError(
      "CONFLICT",
      "This course has no indexed material yet — a teacher can build the AI index from the Materials section.",
    );
  }

  const history = (await db
    .collection("assistant_messages")
    .find({ courseId, userId: user.id })
    .sort({ createdAt: -1 })
    .limit(6)
    .toArray()) as unknown as (MessageDoc & { _id: unknown })[];

  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.materialTitle} (part ${c.order + 1})\n${c.text}`)
    .join("\n\n");
  const transcript = history
    .reverse()
    .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`)
    .join("\n");

  const answer = await chat([
    {
      role: "system",
      content:
        "You are a study tutor for one university course. Answer ONLY from the numbered course-material excerpts and the recent conversation. " +
        "Cite excerpts inline as [1], [2]… Every claim from the materials needs its citation number. " +
        "If the excerpts don't contain the answer, say exactly that and suggest what to ask or check instead. Be concise and exam-oriented.",
    },
    {
      role: "user",
      content: `Course material excerpts:\n\n${context}\n\n${transcript ? `Recent conversation:\n${transcript}\n\n` : ""}Question: ${parsed.data.question}`,
    },
  ]);

  const now = new Date();
  const userMsg: MessageDoc = {
    _id: null,
    courseId,
    userId: user.id,
    role: "user",
    content: parsed.data.question,
    citations: [],
    createdAt: now,
  };
  const botMsg: MessageDoc = {
    _id: null,
    courseId,
    userId: user.id,
    role: "assistant",
    content: answer,
    citations: chunks.map((c) => ({ materialId: c.materialId, title: c.materialTitle, part: c.order + 1 })),
    createdAt: new Date(now.getTime() + 1),
  };
  await db.collection("assistant_messages").insertMany([userMsg, botMsg] as never[]);

  const usedNow = used + 1;
  return {
    answer: toMessage({ ...botMsg, _id: "new" } as MessageDoc & { _id: unknown }),
    quota: {
      used: usedNow,
      quota,
      secondsUntilNextAsk: MIN_ASK_GAP_SECONDS,
    },
  };
}

export async function clearThread(session: SessionForAuth | null, courseId: string): Promise<void> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const user = session!.user as { id: string };
  await (await getDb()).collection("assistant_messages").deleteMany({ courseId, userId: user.id });
}
