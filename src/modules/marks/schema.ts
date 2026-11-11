import { z } from "zod";
import { AppError } from "@/modules/shared/errors";

/**
 * Marks, assessment & results contracts + pure policies (Phase 6, UCM-F18…F24).
 * All math lives here as pure functions and gets dedicated unit tests — per
 * MEMORY this is the highest-bug-risk area of the system.
 *
 * Model: one assessment schema per course (components with maxMarks + weight,
 * weights summing to exactly 100); one marks doc per (courseId, userId,
 * componentKey); weighted totals + grades computed on the fly, never stored.
 */

export interface AssessmentComponent {
  key: string; // stable id, e.g. "ct1", "mid", "final"
  name: string; // display, e.g. "Class Test 1"
  maxMarks: number;
  weight: number; // percent of the 100 total
}

export interface AssessmentSchema {
  courseId: string;
  components: AssessmentComponent[];
  gradeTable: GradeTableEntry[];
  published: boolean;
  publishedAt: string | null;
  updatedBy: string;
}

export interface MarkEntry {
  userId: string;
  componentKey: string;
  score: number | null;
  updatedBy: string;
  updatedAt: string;
}

export interface MarkHistoryEntry {
  score: number;
  by: string;
  at: string;
  reason: string;
}

/** One spreadsheet row: student + per-component scores + computed total/grade. */
export interface MarksGridRow {
  userId: string;
  name: string;
  studentId: string;
  section: string;
  scores: Record<string, number | null>;
  total: number;
  grade: string;
  gradePoint: number;
  updatedAt: string | null;
}

/* -------------------------------------------------------------- contracts */

export const ComponentSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/, "Component keys use letters, numbers, dashes or underscores"),
  name: z.string().trim().min(1).max(80),
  maxMarks: z.number().int().min(1).max(1000),
  weight: z.number().int().min(1).max(100),
});

export const SchemaDraftSchema = z.object({
  components: z.array(ComponentSchema).min(1).max(12),
});

export const MarkSaveSchema = z.object({
  courseId: z.string().min(1),
  userId: z.string().min(1),
  componentKey: z.string().min(1),
  score: z.number().min(0).nullable(),
  reason: z.string().trim().max(300).default(""),
});

/* ------------------------------------------------------------------ policies */

/** UCM-F18: keys unique, weights sum to EXACTLY 100, sensible maxMarks. */
export function validateComponents(
  components: AssessmentComponent[],
): { ok: true } | { ok: false; reason: string } {
  if (components.length === 0) return { ok: false, reason: "Add at least one component." };
  const keys = new Set<string>();
  for (const c of components) {
    if (keys.has(c.key)) return { ok: false, reason: `Duplicate component key "${c.key}".` };
    keys.add(c.key);
    if (!Number.isFinite(c.maxMarks) || c.maxMarks < 1) {
      return { ok: false, reason: `${c.name} needs max marks of at least 1.` };
    }
    if (!Number.isFinite(c.weight) || c.weight < 1) {
      return { ok: false, reason: `${c.name} needs a weight of at least 1%.` };
    }
  }
  const sum = components.reduce((acc, c) => acc + c.weight, 0);
  if (sum !== 100) {
    return { ok: false, reason: `Weights must sum to exactly 100 — currently ${sum}.` };
  }
  return { ok: true };
}

/**
 * UCM-F20: weighted total = Σ score/maxMarks × weight. Scores above maxMarks
 * are clamped (defense in depth; the service validates too). Missing marks
 * count as 0 — a student with nothing entered just scores low.
 */
export function weightedTotal(
  scores: Map<string, number | null>,
  components: AssessmentComponent[],
): number {
  let total = 0;
  for (const c of components) {
    const raw = scores.get(c.key);
    const score = raw === null || raw === undefined ? 0 : Math.min(raw, c.maxMarks);
    total += (score / c.maxMarks) * c.weight;
  }
  return Math.round(total * 100) / 100;
}

/* --------------------------------------------------------------- grade table */

export interface GradeTableEntry {
  min: number; // inclusive lower bound of the total
  letter: string;
  point: number; // GPA points
}

/** Standard BD university scale (UCM-F21 default; per-course overridable). */
export const DEFAULT_GRADE_TABLE: GradeTableEntry[] = [
  { min: 80, letter: "A+", point: 4.0 },
  { min: 75, letter: "A", point: 3.75 },
  { min: 70, letter: "A-", point: 3.5 },
  { min: 65, letter: "B+", point: 3.25 },
  { min: 60, letter: "B", point: 3.0 },
  { min: 55, letter: "B-", point: 2.75 },
  { min: 50, letter: "C+", point: 2.5 },
  { min: 45, letter: "C", point: 2.25 },
  { min: 40, letter: "D", point: 2.0 },
  { min: 0, letter: "F", point: 0.0 },
];

export function validateGradeTable(table: GradeTableEntry[]): { ok: true } | { ok: false; reason: string } {
  if (table.length === 0) return { ok: false, reason: "Grade table is empty." };
  if (table[table.length - 1].min !== 0) {
    return { ok: false, reason: "The last grade band must start at 0 (F)." };
  }
  for (let i = 0; i < table.length - 1; i++) {
    if (table[i].min <= table[i + 1].min) {
      return { ok: false, reason: "Grade bands must be strictly descending." };
    }
  }
  return { ok: true };
}

/** UCM-F21: first band whose min ≤ total wins; table must be validated first. */
export function gradeFor(
  total: number,
  table: GradeTableEntry[] = DEFAULT_GRADE_TABLE,
): GradeTableEntry {
  const sorted = [...table].sort((a, b) => b.min - a.min);
  for (const band of sorted) {
    if (total >= band.min) return band;
  }
  return sorted[sorted.length - 1]; // F fallback
}

/* ------------------------------------------------------------------- publish */

export type MarkWriteContext = {
  role: string;
  isTeacherOfCourse: boolean;
  published: boolean;
  hasReason: boolean;
};

export type MarkWriteDecision = { ok: true; isOverride: boolean } | { ok: false; reason: string };

/**
 * UCM-F19/F23: course teacher (or admin) writes marks freely while
 * unpublished; after publish only admin overrides are allowed and they
 * MUST carry a reason (logged). Returns whether the write is an override
 * so callers can label the audit entry.
 */
export function canWriteMark(ctx: MarkWriteContext): MarkWriteDecision {
  if (ctx.role !== "admin" && !ctx.isTeacherOfCourse) {
    return { ok: false, reason: "Only the course teacher or an admin can enter marks." };
  }
  if (!ctx.published) return { ok: true, isOverride: false };
  if (ctx.role !== "admin") {
    return { ok: false, reason: "Results are published — ask an admin to override." };
  }
  if (!ctx.hasReason) {
    return { ok: false, reason: "Overrides after publication need a reason (logged)." };
  }
  return { ok: true, isOverride: true };
}

/* ------------------------------------------------------------------ averages */

/** Class average per component (UCM-F24); null when nobody has marks. */
export function componentAverages(
  rows: Array<{ scores: Map<string, number | null> }>,
  components: AssessmentComponent[],
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const c of components) {
    const values = rows
      .map((r) => r.scores.get(c.key))
      .filter((v): v is number => typeof v === "number");
    out.set(c.key, values.length === 0 ? null : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100);
  }
  return out;
}

/** Average share of maxMarks (0–100) for the "vs class" bar comparison. */
export function componentAveragePercent(
  average: number | null,
  component: AssessmentComponent,
): number | null {
  if (average === null) return null;
  return Math.round((average / component.maxMarks) * 1000) / 10;
}

export function marksValidationError(message: string): AppError {
  return new AppError("VALIDATION_FAILED", message);
}
