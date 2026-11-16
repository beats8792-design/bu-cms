import { z } from "zod";

/**
 * Notifications contracts + pure helpers (Phase 7). One doc per recipient —
 * fan-out inserts many rows (no fan-out-on-read complexity); read state is
 * per user. Reminders dedupe on (refId, window) recorded by the sender.
 */

export const NOTIFICATION_TYPES = [
  "announcement",
  "assignment-deadline",
  "exam-schedule",
  "results-published",
  "system",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface Notification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export const MarkReadSchema = z.object({
  ids: z.array(z.string().min(1)).max(100).optional(),
  all: z.boolean().optional(),
});

/**
 * Reminder windows per PRD UCM-F25/Phase 7: T-48h, T-24h, T-2h before a
 * deadline. `dueWindows` returns the windows whose lead time has started
 * and whose deadline has not passed yet — the caller records the ones it
 * sends, so each window fires at most once per item.
 */
export const REMINDER_WINDOWS_H = [48, 24, 2] as const;
export type ReminderWindow = (typeof REMINDER_WINDOWS_H)[number];

export function dueWindows(deadline: Date, now: Date): ReminderWindow[] {
  const hoursLeft = (deadline.getTime() - now.getTime()) / 3_600_000;
  if (hoursLeft <= 0) return [];
  return REMINDER_WINDOWS_H.filter((h) => hoursLeft <= h);
}

/** Stable dedup key per item + window. */
export function reminderKey(refId: string, window: ReminderWindow): string {
  return `${refId}:${window}h`;
}

export function labelForWindow(window: ReminderWindow): string {
  return window === 48 ? "in 2 days" : window === 24 ? "tomorrow" : "within 2 hours";
}

/** Reminder labels per window (icon-free; UI shows text, never icons alone). */
