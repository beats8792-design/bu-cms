"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerSession } from "@/modules/auth/session";
import { AppError } from "@/modules/shared/errors";
import { saveMark, saveSchema, setPublished } from "@/modules/marks/service";

/**
 * Marks server actions. The grid posts one row per save (student ×
 * components); the schema editor posts the whole draft. No file payloads.
 */

export type MarksFormState = { error?: string; ok?: boolean };

const SchemaActionSchema = z.object({
  courseId: z.string().min(1),
  count: z.string(),
});

interface ComponentDraft {
  key: string;
  name: string;
  maxMarks: number;
  weight: number;
}

function parseComponents(formData: FormData): ComponentDraft[] | null {
  const count = Number(formData.get("count") ?? 0);
  if (!Number.isInteger(count) || count < 1 || count > 12) return null;
  const components: ComponentDraft[] = [];
  for (let i = 0; i < count; i++) {
    const key = String(formData.get(`key-${i}`) ?? "").trim();
    const name = String(formData.get(`name-${i}`) ?? "").trim();
    const maxMarks = Number(formData.get(`max-${i}`) ?? 0);
    const weight = Number(formData.get(`weight-${i}`) ?? 0);
    if (!key || !name) return null;
    components.push({ key, name, maxMarks, weight });
  }
  return components;
}

export async function saveSchemaAction(
  _prev: MarksFormState,
  formData: FormData,
): Promise<MarksFormState> {
  const session = await getServerSession();
  const parsed = SchemaActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  const components = parseComponents(formData);
  if (!components) return { error: "Every component needs a key, name, max marks and weight." };
  try {
    await saveSchema(session, parsed.data.courseId, { components });
    revalidatePath(`/courses/${parsed.data.courseId}/marks`);
    revalidatePath(`/courses/${parsed.data.courseId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[marks:schema]", err);
    return { error: "Could not save the assessment plan." };
  }
}

const MarkActionSchema = z.object({
  courseId: z.string().min(1),
  userId: z.string().min(1),
});

export async function saveRowAction(
  _prev: MarksFormState,
  formData: FormData,
): Promise<MarksFormState> {
  const session = await getServerSession();
  const parsed = MarkActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };

  // score-<componentKey> fields; blank input clears the mark.
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("score-") || typeof value !== "string") continue;
    const componentKey = key.slice("score-".length);
    const raw = value.trim();
    let score: number | null = null;
    if (raw !== "") {
      score = Number(raw);
      if (!Number.isFinite(score)) return { error: "Scores must be numbers." };
    }
    try {
      await saveMark(session, {
        courseId: parsed.data.courseId,
        userId: parsed.data.userId,
        componentKey,
        score,
        reason: String(formData.get("reason") ?? ""),
      });
    } catch (err) {
      if (err instanceof AppError) return { error: err.message };
      console.error("[marks:saveRow]", err);
      return { error: "Could not save the marks." };
    }
  }
  revalidatePath(`/courses/${parsed.data.courseId}/marks`);
  return { ok: true };
}

const PublishSchema = z.object({
  courseId: z.string().min(1),
  published: z.string(),
});

export async function setPublishedAction(
  _prev: MarksFormState,
  formData: FormData,
): Promise<MarksFormState> {
  const session = await getServerSession();
  const parsed = PublishSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await setPublished(session, parsed.data.courseId, parsed.data.published === "true");
    revalidatePath(`/courses/${parsed.data.courseId}/marks`);
    revalidatePath(`/courses/${parsed.data.courseId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[marks:publish]", err);
    return { error: "Could not update publication." };
  }
}
