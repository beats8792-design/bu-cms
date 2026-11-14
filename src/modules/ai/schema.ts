import { z } from "zod";

/**
 * AI contracts + pure policies (Phase 9, UCM-A1–A4). Everything I/O-free lives
 * here so it unit-tests without the AI service: chunking, cosine similarity,
 * quotas/rate limits and the three structured-output schemas. API access is
 * in `gemini.ts`; Mongo access in rag/assistant/summarizer/quiz/planner.
 */

/* ------------------------------------------------------------------ chunking */

export const CHUNK_CHARS = 1200;
export const CHUNK_OVERLAP = 200;

/**
 * Slide a fixed window with overlap across the text. Pure; tolerant of short
 * or empty input (empty → no chunks). Whitespace is normalised first so PDF
 * extraction artefacts don't explode chunk counts.
 */
export function chunkText(text: string): string[] {
  const normalised = text.replace(/\s+/g, " ").trim();
  if (normalised.length === 0) return [];
  if (normalised.length <= CHUNK_CHARS) return [normalised];
  const chunks: string[] = [];
  const step = CHUNK_CHARS - CHUNK_OVERLAP;
  for (let i = 0; i < normalised.length; i += step) {
    chunks.push(normalised.slice(i, i + CHUNK_CHARS));
    if (i + CHUNK_CHARS >= normalised.length) break;
  }
  return chunks;
}

/** Cosine similarity over equal-length numeric vectors; 0 for any mismatch. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/* ------------------------------------------------------- quotas + rate limit */

/** Daily question quota per role (admin effectively unlimited). */
export function dailyQuotaFor(role: string): number {
  switch (role) {
    case "admin":
      return 999;
    case "teacher":
      return 60;
    case "cr":
      return 30;
    default:
      return 20;
  }
}

export const MIN_ASK_GAP_SECONDS = 8;

/** Minimum gap between two asks by the same user (anti-spam). */
export function withinRateLimit(lastAskAt: string | null, now = new Date()): boolean {
  if (!lastAskAt) return true;
  return (now.getTime() - new Date(lastAskAt).getTime()) / 1000 >= MIN_ASK_GAP_SECONDS;
}

/** Start of today (UTC instant) in Dhaka — quota window boundary. */
export function startOfDhakaDay(now = new Date()): Date {
  const dhaka = new Date(now.getTime() + 6 * 3_600_000);
  dhaka.setUTCHours(0, 0, 0, 0);
  return new Date(dhaka.getTime() - 6 * 3_600_000);
}

/* ---------------------------------------------------------------- assistant */

export const AskSchema = z.object({
  question: z.string().trim().min(5).max(1000),
});

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Array<{ materialId: string; title: string; part: number }>;
  createdAt: string;
}

/* --------------------------------------------------------------- summarizer */

export const SummarySchema = z.object({
  overview: z.string().min(10).max(2000),
  keyPoints: z.array(z.string().min(3).max(400)).min(1).max(12),
  definitions: z
    .array(z.object({ term: z.string().min(1).max(120), meaning: z.string().min(3).max(400) }))
    .max(12)
    .default([]),
  formulas: z.array(z.string().min(1).max(300)).max(12).default([]),
  studyQuestions: z.array(z.string().min(5).max(300)).min(1).max(10),
});

export type MaterialSummary = z.infer<typeof SummarySchema> & {
  id: string;
  materialId: string;
  createdAt: string;
};

/* -------------------------------------------------------------------- quiz */

export const QUIZ_COUNTS = [5, 10, 20] as const;

export const QuizQuestionSchema = z.object({
  question: z.string().trim().min(5).max(500),
  options: z.array(z.string().trim().min(1).max(200)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().max(600).default(""),
});

export const QuizDraftSchema = z.object({
  questions: z.array(QuizQuestionSchema).min(5).max(20),
});

export interface QuizDraft {
  id: string;
  courseId: string;
  createdBy: string;
  creatorName: string;
  topic: string;
  questions: Array<z.infer<typeof QuizQuestionSchema>>;
  createdAt: string;
}

/* ------------------------------------------------------------------ planner */

export const PlanItemSchema = z.object({
  weekday: z.number().int().min(0).max(6), // JS day number, Sun=0 (BD week Sun–Thu)
  title: z.string().trim().min(3).max(120),
  focus: z.string().trim().max(200).default(""),
  minutes: z.number().int().min(15).max(300),
  courseCode: z.string().trim().max(20).default(""),
});

export const WeeklyPlanSchema = z.object({
  summary: z.string().trim().max(600).default(""),
  items: z.array(PlanItemSchema).min(1).max(40),
});

export interface StudyPlan {
  id: string;
  userId: string;
  summary: string;
  items: Array<z.infer<typeof PlanItemSchema> & { id: string; done: boolean }>;
  createdAt: string;
}

export function WEEKDAY(day: number): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] ?? "";
}
