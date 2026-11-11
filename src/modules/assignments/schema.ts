import { z } from "zod";
import { AppError } from "@/modules/shared/errors";

/**
 * Assignments contracts + pure policies (Phase 4, UCM-F10…F14).
 * Deadlines are always Asia/Dhaka (UTC+6, no DST) per PRD — stored as ISO
 * strings carrying the +06:00 offset so `new Date(iso)` is unambiguous.
 */

export const DHAKA_OFFSET = "+06:00";

/** "2026-11-15" + "23:59" -> ISO instant with the Dhaka offset. */
export function dhakaToIso(date: string, time: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new AppError("VALIDATION_FAILED", "Deadline needs a valid date and time.");
  }
  return `${date}T${time}:00${DHAKA_OFFSET}`;
}

export function isoToDhakaParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Absolute + relative chip text per DESIGN.md §8. */
export function formatDeadline(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const abs = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  const diffMs = d.getTime() - now.getTime();
  const diffH = diffMs / 3_600_000;
  let rel: string;
  if (diffH > 48) rel = `in ${Math.floor(diffH / 24)} days`;
  else if (diffH > 1) rel = `in ${Math.floor(diffH)} h`;
  else if (diffH > 0) rel = `in ${Math.max(1, Math.round(diffH * 60))} min`;
  else rel = "overdue";
  return `${abs} (Asia/Dhaka) · ${rel}`;
}

export type DeadlineState = "open" | "due-soon" | "closed";

/** due-soon window = T-48h per PRD UCM-F13. */
export function deadlineState(iso: string, now = new Date()): DeadlineState {
  const diffMs = new Date(iso).getTime() - now.getTime();
  if (diffMs <= 0) return "closed";
  if (diffMs <= 48 * 3_600_000) return "due-soon";
  return "open";
}

/* -------------------------------------------------------------- contracts */

export type LatePolicy = "allow" | "block";

export const AssignmentSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(5000).default(""),
  points: z.number().int().min(1).max(1000),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+06:00$/, "Deadline is required"),
  latePolicy: z.enum(["allow", "block"]).default("allow"),
  attachments: z
    .array(
      z.object({
        publicId: z.string().min(3).max(400),
        fileName: z.string().min(1).max(200),
        size: z.number().int().min(1),
      }),
    )
    .max(5)
    .default([]),
});
export type Assignment = z.infer<typeof AssignmentSchema> & {
  id: string;
  createdBy: string;
};

export const SubmissionFilesSchema = z
  .array(
    z.object({
      publicId: z.string().min(3).max(400),
      fileName: z.string().min(1).max(200),
      size: z.number().int().min(1).max(30 * 1024 * 1024),
    }),
  )
  .max(5);

export type SubmissionFile = z.infer<typeof SubmissionFilesSchema>[number];

export interface Submission {
  assignmentId: string;
  userId: string;
  files: SubmissionFile[];
  note: string;
  submittedAt: string;
  isLate: boolean;
  score: number | null;
  feedback: string;
  gradedAt: string | null;
  versionHistory: Array<{ at: string; files: SubmissionFile[]; note: string; isLate: boolean }>;
}

/* ---------------------------------------------------------------- policies */

export type SubmitContext = {
  role: string;
  enrolled: boolean;
  now: number;
  deadlineIso: string;
  latePolicy: LatePolicy;
  hasFiles: boolean;
};

export type SubmitDecision = { ok: true; isLate: boolean } | { ok: false; reason: string };

/** Pure submission gate (UCM-F11): enrolled students only; late auto-flag. */
export function canSubmit(ctx: SubmitContext): SubmitDecision {
  if (ctx.role !== "student" && ctx.role !== "cr") {
    return { ok: false, reason: "Only students submit assignments." };
  }
  if (!ctx.enrolled) return { ok: false, reason: "Enroll in this course to submit." };
  if (!ctx.hasFiles) return { ok: false, reason: "Attach at least one file." };

  const late = ctx.now > new Date(ctx.deadlineIso).getTime();
  if (late && ctx.latePolicy === "block") {
    return { ok: false, reason: "The deadline has passed and late submissions are blocked." };
  }
  return { ok: true, isLate: late };
}

/** Pure grade validator (UCM-F12): score within [0, points]. */
export function validateScore(score: number, points: number): string | null {
  if (!Number.isFinite(score)) return "Score must be a number.";
  if (score < 0 || score > points) return `Score must be between 0 and ${points}.`;
  return null;
}

/** Teacher dashboard merge (UCM-F14): full roster + submission statuses. */
export type RosterStudent = { userId: string; name: string; studentId: string; section: string };
export type SubmissionRow = Pick<Submission, "userId" | "isLate" | "score" | "submittedAt">;

export type StudentAssignmentStatus = {
  userId: string;
  name: string;
  studentId: string;
  section: string;
  status: "pending" | "submitted" | "late" | "graded";
  submittedAt: string | null;
  score: number | null;
};

export function mergeStatuses(
  roster: RosterStudent[],
  submissions: SubmissionRow[],
  deadlineIso: string,
  now = Date.now(),
): StudentAssignmentStatus[] {
  const byUser = new Map(submissions.map((s) => [s.userId, s]));
  const deadlinePassed = now > new Date(deadlineIso).getTime();
  return roster
    .map((r) => {
      const s = byUser.get(r.userId);
      let status: StudentAssignmentStatus["status"] = "pending";
      if (s) {
        if (s.score !== null && s.score !== undefined) status = "graded";
        else if (s.isLate) status = "late";
        else status = "submitted";
      } else if (deadlinePassed) {
        status = "pending"; // stays pending; the late flag would apply on submit
      }
      return {
        userId: r.userId,
        name: r.name,
        studentId: r.studentId,
        section: r.section,
        status,
        submittedAt: s?.submittedAt ?? null,
        score: s?.score ?? null,
      };
    })
    .sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name));
}

export function assignmentValidationError(message: string): AppError {
  return new AppError("VALIDATION_FAILED", message);
}
