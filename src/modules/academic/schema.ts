import { z } from "zod";
import { AppError } from "@/modules/shared/errors";

/**
 * Academic-core contracts + pure policies. Everything here is free of I/O so
 * it can be unit-tested (Brain/ARCHITECTURE.md §9). Mongo access lives in the
 * sibling service files; UI in app/(app) and app/(app)/admin.
 */

/* ----------------------------------------------------------------- shared */

export const DEPT_CODE = /^[A-Z][A-Z&-]{1,9}$/; // "CSE", "BBA", "E&CE"
export const COURSE_CODE = /^[A-Z0-9&-]{3,12}$/; // "CSE-101", "MAT1101"
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function toAppError(message: string): AppError {
  return new AppError("VALIDATION_FAILED", message);
}

/* ------------------------------------------------------------- departments */

export const DepartmentSchema = z.object({
  code: z.string().trim().toUpperCase().regex(DEPT_CODE, "2–10 letters, e.g. CSE"),
  name: z.string().trim().min(3).max(120),
  programList: z.array(z.string().trim().max(80)).max(10).default([]),
});
export type Department = z.infer<typeof DepartmentSchema> & { id: string; headUserId?: string };

/* -------------------------------------------------------------- semesters */

export const TERMS = ["Spring", "Summer", "Autumn"] as const;
export const SemesterSchema = z
  .object({
    academicYear: z.string().trim().regex(/^\d{4}\/\d{4}$/, "Format YYYY/YYYY, e.g. 2025/2026"),
    term: z.enum(TERMS),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date required"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date required"),
    enrollmentOpen: z.boolean().default(false),
  })
  .refine((s) => s.startDate < s.endDate, { message: "End date must be after the start date." });
export type Semester = z.infer<typeof SemesterSchema> & { id: string };

/* ----------------------------------------------------------------- courses */

export const ScheduleSlotSchema = z
  .object({
    day: z.number().int().min(0).max(6), // JS getDay: 0 = Sunday … 6 = Saturday
    start: z.string().regex(HHMM, "HH:MM"),
    end: z.string().regex(HHMM, "HH:MM"),
    room: z.string().trim().max(40).default(""),
    section: z.string().trim().max(8).default("A"),
  })
  .refine((s) => s.start < s.end, { message: "End time must be after start time." });
export type ScheduleSlot = z.infer<typeof ScheduleSlotSchema>;

export const CourseSchema = z.object({
  code: z.string().trim().toUpperCase().regex(COURSE_CODE, "3–12 chars, e.g. CSE-101"),
  title: z.string().trim().min(3).max(160),
  credits: z.number().min(0.5).max(12),
  type: z.enum(["core", "elective"]).default("core"),
  departmentId: z.string().min(1, "Pick a department"),
  semesterId: z.string().min(1, "Pick a semester"),
  teacherIds: z.array(z.string()).max(10).optional(), // create sets it; update keeps existing
  seatLimit: z.number().int().min(1).max(1000).default(40),
  syllabus: z.string().max(20_000).default(""),
  schedule: z.array(ScheduleSlotSchema).max(20).default([]),
});
export type Course = z.infer<typeof CourseSchema> & { id: string };

/* ------------------------------------------------------------- enrollments */

export const ENROLLMENT_STATUSES = ["enrolled", "dropped"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const EnrollSchema = z.object({
  courseId: z.string().min(1),
  section: z.string().trim().max(8).default("A"),
});

/** Pure enrollment-eligibility policy (the gate every caller must pass). */
export type EnrollContext = {
  role: string; // caller's role (self-service roles: student, cr)
  status: "active" | "pending" | "suspended";
  windowOpen: boolean;
  seatsTaken: number;
  seatLimit: number;
  existingStatus?: EnrollmentStatus | null; // prior row for (course, user)
};

export type EnrollDecision = { ok: true } | { ok: false; reason: string };

export function canSelfEnroll(ctx: EnrollContext): EnrollDecision {
  if (ctx.role !== "student" && ctx.role !== "cr") {
    return { ok: false, reason: "Only students can self-enroll." };
  }
  if (ctx.status !== "active") {
    return { ok: false, reason: "Your account is not active." };
  }
  if (!ctx.windowOpen) {
    return { ok: false, reason: "Enrollment is closed for this semester." };
  }
  if (ctx.existingStatus === "enrolled") {
    return { ok: false, reason: "You are already enrolled in this course." };
  }
  if (ctx.seatsTaken >= ctx.seatLimit) {
    return { ok: false, reason: "This course is full." };
  }
  return { ok: true };
}

/* ---------------------------------------------------------------- calendar */

export const CalendarEventSchema = z.object({
  title: z.string().trim().min(3).max(160),
  type: z.enum(["exam", "holiday", "notice"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date required"),
  scope: z.object({ type: z.enum(["university", "dept", "course"]), refId: z.string().default("") }),
  description: z.string().trim().max(2000).default(""),
});
export type CalendarEvent = z.infer<typeof CalendarEventSchema> & { id: string };

/* ----------------------------------------------------------------- helpers */

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Bangladesh class week order (Sun–Thu working days, Fri/Sat weekend). */
export const WEEK_ORDER = [0, 1, 2, 3, 4, 5, 6] as const;

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Detects overlapping slots on the same day (for the same section).
 * Pure so the teacher gets inline feedback before saving.
 */
export function findScheduleConflicts(slots: ScheduleSlot[]): string[] {
  const conflicts: string[] = [];
  const byDay = new Map<number, ScheduleSlot[]>();
  for (const s of slots) {
    const list = byDay.get(s.day) ?? [];
    list.push(s);
    byDay.set(s.day, list);
  }
  for (const [day, list] of byDay) {
    const sorted = [...list].sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (prev.section !== cur.section) continue; // parallel sections may overlap
      if (minutesOf(cur.start) < minutesOf(prev.end)) {
        conflicts.push(
          `${DAY_LABELS[day]}: ${prev.start}–${prev.end} overlaps ${cur.start}–${cur.end} (section ${cur.section})`,
        );
      }
    }
  }
  return conflicts;
}

/** A week grid for rendering: day (0–6) → slots sorted by start time. */
export function buildWeekGrid<T extends ScheduleSlot>(slots: T[]): Map<number, T[]> {
  const grid = new Map<number, T[]>();
  for (const slot of slots) {
    const list = grid.get(slot.day) ?? [];
    list.push(slot);
    grid.set(slot.day, list);
  }
  for (const list of grid.values()) {
    list.sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
  }
  return grid;
}

export function formatSlot(slot: ScheduleSlot): string {
  const room = slot.room ? ` · ${slot.room}` : "";
  return `${slot.start}–${slot.end}${room}`;
}
