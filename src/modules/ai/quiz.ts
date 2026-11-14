import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import { z } from "zod";
import { AiError, aiConfigured, chat, extractJson } from "@/modules/ai/gemini";
import { QuizDraftSchema, type QuizDraft } from "@/modules/ai/schema";
import { retrieve } from "@/modules/ai/rag";
import { toObjectId } from "@/modules/academic/model";
import { isEnrolledIn } from "@/modules/collab/notes";
import type { CourseRow } from "@/modules/academic/courses";

/**
 * Quiz generator (UCM-A3): course + optional topic + count (5/10/20) →
 * MCQ drafts Zod-validated before save (one retry on invalid JSON), answer
 * key included. Drafts are reviewable per course; delete = creator or admin.
 */

interface QuizDoc {
  _id: unknown;
  courseId: string;
  createdBy: string;
  creatorName: string;
  topic: string;
  questions: QuizDraft["questions"];
  createdAt: Date;
}

function toQuiz(d: QuizDoc & { _id: unknown }): QuizDraft {
  return {
    id: String(d._id),
    courseId: d.courseId,
    createdBy: d.createdBy,
    creatorName: d.creatorName,
    topic: d.topic ?? "",
    questions: d.questions ?? [],
    createdAt: (d.createdAt ?? new Date()).toISOString(),
  };
}

export async function listQuizzes(
  session: SessionForAuth | null,
  courseId: string,
): Promise<QuizDraft[]> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const docs = (await (await getDb())
    .collection("quizzes")
    .find({ courseId })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray()) as unknown as (QuizDoc & { _id: unknown })[];
  return docs.map(toQuiz);
}

export async function generateQuiz(
  session: SessionForAuth | null,
  courseId: string,
  input: unknown,
): Promise<QuizDraft> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const parsed = z
    .object({
      topic: z.string().trim().max(120).default(""),
      count: z.union([z.literal(5), z.literal(10), z.literal(20)]),
    })
    .safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);
  const user = session!.user as { id: string; role: string; name: string };
  const db = await getDb();

  const course = (await db.collection("courses").findOne({ _id: toObjectId(courseId) })) as
    | ({ _id: unknown } & CourseRow)
    | null;
  if (!course) throw new AppError("NOT_FOUND", "Course not found.");
  const allowed =
    user.role === "admin" ||
    course.teacherIds.includes(user.id) ||
    ((user.role === "student" || user.role === "cr") && (await isEnrolledIn(course.id, user.id)));
  if (!allowed) {
    throw new AppError("FORBIDDEN", "Only the course's members can generate quizzes.");
  }
  if (!aiConfigured()) {
    throw new AiError("AI features are not configured yet — add GEMINI_API_KEY to the environment.", 503);
  }

  // Ground the questions in retrieved chunks (topic-embedded when given,
  // otherwise a question made from the topic still matches course chunks).
  const chunks = await retrieve(courseId, parsed.data.topic || course.title, 8);
  if (chunks.length === 0) {
    throw new AppError(
      "CONFLICT",
      "This course has no indexed material yet — a teacher can build the AI index from the Materials section.",
    );
  }
  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.materialTitle} — ${c.text}`)
    .join("\n\n");

  const prompt =
    "You write university exam-style MCQs. Answer with ONLY a JSON object: " +
    '{"questions": [{"question": string, "options": [string, string, string, string], "answerIndex": 0|1|2|3, "explanation": string}]}. ' +
    `Exactly ${parsed.data.count} questions, 4 options each, plausible distractors, one clearly correct answer. ` +
    (parsed.data.topic ? `Focus on: ${parsed.data.topic}. ` : "") +
    "Use ONLY the excerpts as source material.";
  const raw = await chat(
    [
      { role: "system", content: prompt },
      { role: "user", content: `Course material excerpts:\n\n${context}` },
    ],
    { json: true, maxTokens: 6000 },
  );

  // Validate; one retry with the complaint appended, then refuse.
  let checked = QuizDraftSchema.safeParse(extractJson(raw));
  if (!checked.success) {
    const retry = await chat(
      [
        { role: "system", content: prompt },
        {
          role: "user",
          content:
            `Course material excerpts:\n\n${context}\n\nYour previous reply was invalid (${checked.error?.issues[0]?.message ?? "not JSON"}). ` +
            `Return ONLY the JSON object with exactly ${parsed.data.count} questions, 4 options each.`,
        },
      ],
      { json: true, maxTokens: 6000 },
    );
    checked = QuizDraftSchema.safeParse(extractJson(retry));
    if (!checked.success) {
      throw new AiError("The AI kept returning an unusable quiz — try a different topic or a smaller count.", 502);
    }
  }
  const questions = checked.data.questions.slice(0, parsed.data.count);

  const inserted = await db.collection("quizzes").insertOne({
    courseId,
    createdBy: user.id,
    creatorName: user.name,
    topic: parsed.data.topic,
    questions,
    createdAt: new Date(),
  } as never);
  const saved = (await db
    .collection("quizzes")
    .findOne({ _id: inserted.insertedId })) as (QuizDoc & { _id: unknown }) | null;
  if (!saved) throw new AppError("INTERNAL", "Quiz vanished after saving.");
  return toQuiz(saved);
}

export async function deleteQuiz(session: SessionForAuth | null, quizId: string): Promise<void> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const user = session!.user as { id: string; role: string };
  const db = await getDb();
  const doc = (await db.collection("quizzes").findOne({ _id: toObjectId(quizId) })) as
    | (QuizDoc & { _id: unknown })
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Quiz not found.");
  if (user.role !== "admin" && doc.createdBy !== user.id) {
    throw new AppError("FORBIDDEN", "Only the quiz's creator or an admin can delete it.");
  }
  await db.collection("quizzes").deleteOne({ _id: toObjectId(quizId) });
}
