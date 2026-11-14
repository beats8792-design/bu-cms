"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerSession } from "@/modules/auth/session";
import { AppError } from "@/modules/shared/errors";
import { AiError } from "@/modules/ai/gemini";
import { ask, clearThread } from "@/modules/ai/assistant";
import { generateSummary } from "@/modules/ai/summarizer";
import { deleteQuiz, generateQuiz } from "@/modules/ai/quiz";
import { generatePlan, toggleItem } from "@/modules/ai/planner";
import { reindexCourse } from "@/modules/ai/rag";

/**
 * AI server actions (Phase 9). Every action maps AiError / AppError to a
 * friendly banner string — AI problems are ordinary, recoverable states.
 */

export type AiFormState = { error?: string; ok?: boolean; info?: string };

function aiMessage(err: unknown): string {
  if (err instanceof AiError || err instanceof AppError) return err.message;
  console.error("[ai:action]", err);
  return "The AI had a problem — try again in a moment.";
}

/* ---------------------------------------------------------------- assistant */

const AskActionSchema = z.object({
  courseId: z.string().min(1),
  question: z.string().trim().min(5).max(1000),
});

export async function askAction(_prev: AiFormState, formData: FormData): Promise<AiFormState> {
  const session = await getServerSession();
  const parsed = AskActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await ask(session, parsed.data.courseId, parsed.data);
    revalidatePath(`/courses/${parsed.data.courseId}/assistant`);
    return { ok: true };
  } catch (err) {
    return { error: aiMessage(err) };
  }
}

export async function clearThreadAction(
  _prev: AiFormState,
  formData: FormData,
): Promise<AiFormState> {
  const session = await getServerSession();
  const parsed = z.object({ courseId: z.string().min(1) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await clearThread(session, parsed.data.courseId);
    revalidatePath(`/courses/${parsed.data.courseId}/assistant`);
    return { ok: true };
  } catch (err) {
    return { error: aiMessage(err) };
  }
}

/* --------------------------------------------------------------- summarizer */

export async function generateSummaryAction(
  _prev: AiFormState,
  formData: FormData,
): Promise<AiFormState> {
  const session = await getServerSession();
  const parsed = z
    .object({ materialId: z.string().min(1), courseId: z.string().min(1) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await generateSummary(session, parsed.data.materialId);
    revalidatePath(`/courses/${parsed.data.courseId}/summaries`);
    return { ok: true };
  } catch (err) {
    return { error: aiMessage(err) };
  }
}

/* -------------------------------------------------------------------- quiz */

const GenerateQuizActionSchema = z.object({
  courseId: z.string().min(1),
  topic: z.string().trim().max(120).default(""),
  count: z.string(),
});

export async function generateQuizAction(
  _prev: AiFormState,
  formData: FormData,
): Promise<AiFormState> {
  const session = await getServerSession();
  const parsed = GenerateQuizActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const count = Number(parsed.data.count);
  if (![5, 10, 20].includes(count)) return { error: "Pick 5, 10 or 20 questions." };
  try {
    await generateQuiz(session, parsed.data.courseId, { topic: parsed.data.topic, count });
    revalidatePath(`/courses/${parsed.data.courseId}/quiz`);
    return { ok: true };
  } catch (err) {
    return { error: aiMessage(err) };
  }
}

export async function deleteQuizAction(_prev: AiFormState, formData: FormData): Promise<AiFormState> {
  const session = await getServerSession();
  const parsed = z
    .object({ id: z.string().min(1), courseId: z.string().min(1) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await deleteQuiz(session, parsed.data.id);
    revalidatePath(`/courses/${parsed.data.courseId}/quiz`);
    return { ok: true };
  } catch (err) {
    return { error: aiMessage(err) };
  }
}

/* ------------------------------------------------------------------ planner */

export async function generatePlanAction(_prev: AiFormState, formData: FormData): Promise<AiFormState> {
  const session = await getServerSession();
  // The form posts no fields; parsing keeps formData "used" and the shape
  // forward-compatible (e.g. a future "startMonday" toggle).
  const parsed = z.object({}).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await generatePlan(session);
    revalidatePath("/study-plan");
    return { ok: true };
  } catch (err) {
    return { error: aiMessage(err) };
  }
}

export async function togglePlanItemAction(
  _prev: AiFormState,
  formData: FormData,
): Promise<AiFormState> {
  const session = await getServerSession();
  const parsed = z
    .object({ itemId: z.string().min(1), done: z.string() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await toggleItem(session, parsed.data.itemId, parsed.data.done === "true");
    revalidatePath("/study-plan");
    return { ok: true };
  } catch (err) {
    return { error: aiMessage(err) };
  }
}

/* --------------------------------------------------------------- AI index */

export async function reindexCourseAction(
  _prev: AiFormState,
  formData: FormData,
): Promise<AiFormState> {
  const session = await getServerSession();
  const parsed = z.object({ courseId: z.string().min(1) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    const { indexed, chunks } = await reindexCourse(session, parsed.data.courseId);
    revalidatePath(`/courses/${parsed.data.courseId}/assistant`);
    return { ok: true, info: `Indexed ${indexed} material${indexed === 1 ? "" : "s"} — ${chunks} chunks ready.` };
  } catch (err) {
    return { error: aiMessage(err) };
  }
}
