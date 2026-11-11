import { z } from "zod";
import { AppError } from "@/modules/shared/errors";

/**
 * Attendance contracts + pure policies (Phase 5, UCM-F15…F17).
 * Sessions are per course + section + Dhaka date (+ optional topic); records
 * hold one status per (sessionId, userId). Percentage = attended sessions /
 * applicable sessions, computed on the fly (UCM-F16).
 */

/** Late counts as attended (flagged separately in the UI). */
export const ATTENDANCE_STATUSES = ["present", "absent", "late"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const DEFAULT_ATTENDANCE_THRESHOLD = 75;

export const OpenSessionSchema = z.object({
  courseId: z.string().min(1),
  section: z.string().trim().min(1).max(10).default("A"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  topic: z.string().trim().max(300).default(""),
});

export interface AttendanceSession {
  id: string;
  courseId: string;
  section: string;
  date: string; // YYYY-MM-DD (Asia/Dhaka)
  topic: string;
  status: "open" | "closed";
  createdBy: string;
  closedAt: string | null;
}

export interface AttendanceRecord {
  sessionId: string;
  userId: string;
  status: AttendanceStatus;
  markedAt: string;
}

const RecordSchema = z.object({
  userId: z.string().min(1),
  status: z.enum(ATTENDANCE_STATUSES),
});

/** Bulk roster save: 5…500 students per session. */
export const RosterSchema = z.object({
  marks: z.array(RecordSchema).min(1).max(500),
});
export type RosterMark = z.infer<typeof RecordSchema>;

/** Today's date in Asia/Dhaka (en-CA gives YYYY-MM-DD). */
export function dhakaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(now);
}

/**
 * Which sessions apply to a student when computing their percentage:
 * sessions of their own section that are either closed or already marked
 * for them — an open, unmarked session never penalizes anyone.
 */
export interface StatSession {
  id: string;
  section: string;
  closed: boolean;
}

export function applicableSessions(
  sessions: StatSession[],
  studentSection: string,
  markedSessionIds: Set<string>,
): StatSession[] {
  return sessions.filter(
    (s) => s.section === studentSection && (s.closed || markedSessionIds.has(s.id)),
  );
}

export interface AttendanceStats {
  attended: number;
  possible: number;
  /** null = no applicable sessions yet (avoid a fake 100%). */
  pct: number | null;
}

/** UCM-F16: present + late / applicable sessions, on the fly. */
export function attendanceStats(
  statuses: AttendanceStatus[],
  sessions: StatSession[],
  studentSection: string,
  markedSessionIds: Set<string>,
): AttendanceStats {
  const applicable = applicableSessions(sessions, studentSection, markedSessionIds);
  if (applicable.length === 0) return { attended: 0, possible: 0, pct: null };
  const attended = statuses.filter((s) => s === "present" || s === "late").length;
  return {
    attended,
    possible: applicable.length,
    pct: Math.round((attended / applicable.length) * 1000) / 10,
  };
}

/** UCM-F17: below the threshold (default 75%) → warning. */
export function isLowAttendance(pct: number | null, threshold = DEFAULT_ATTENDANCE_THRESHOLD): boolean {
  return pct !== null && pct < threshold;
}

export function lowAttendanceMessage(pct: number | null, threshold = DEFAULT_ATTENDANCE_THRESHOLD): string | null {
  if (!isLowAttendance(pct, threshold) || pct === null) return null;
  return `Attendance ${pct}% is below the ${threshold}% threshold.`;
}

export interface StudentAttendanceRow {
  userId: string;
  name: string;
  studentId: string;
  section: string;
  stats: AttendanceStats;
  warning: boolean;
}

/** Teacher/CR digest: full roster with per-student stats + warning flag. */
export function buildDigest(
  roster: Array<{ userId: string; name: string; studentId: string; section: string }>,
  recordsByUser: Map<string, AttendanceStatus[]>,
  markedByUser: Map<string, Set<string>>,
  sessions: StatSession[],
  threshold = DEFAULT_ATTENDANCE_THRESHOLD,
): StudentAttendanceRow[] {
  return roster
    .map((r) => {
      const stats = attendanceStats(
        recordsByUser.get(r.userId) ?? [],
        sessions,
        r.section,
        markedByUser.get(r.userId) ?? new Set(),
      );
      return { ...r, stats, warning: isLowAttendance(stats.pct, threshold) };
    })
    .sort(
      (a, b) =>
        Number(b.warning) - Number(a.warning) ||
        (a.stats.pct ?? 100) - (b.stats.pct ?? 100) ||
        a.name.localeCompare(b.name),
    );
}

export function attendanceValidationError(message: string): AppError {
  return new AppError("VALIDATION_FAILED", message);
}
