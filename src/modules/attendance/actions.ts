"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerSession } from "@/modules/auth/session";
import { AppError } from "@/modules/shared/errors";
import {
  openSession,
  saveRoster,
  setCourseThreshold,
  setSessionClosed,
} from "@/modules/attendance/service";

/**
 * Attendance server actions. Roster marks arrive as `status-<userId>` form
 * fields from the session page radios; no file payloads involved.
 */

export type AttendanceFormState = { error?: string; ok?: boolean; id?: string };

const OpenSchema = z.object({
  courseId: z.string().min(1),
  section: z.string().trim().min(1).max(10).default("A"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  topic: z.string().trim().max(300).default(""),
});

export async function openSessionAction(
  _prev: AttendanceFormState,
  formData: FormData,
): Promise<AttendanceFormState> {
  const session = await getServerSession();
  const parsed = OpenSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const id = await openSession(session, parsed.data);
    revalidatePath(`/courses/${parsed.data.courseId}`);
    return { ok: true, id };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[attendance:open]", err);
    return { error: "Could not open the session." };
  }
}

const MarkSchema = z.object({
  sessionId: z.string().min(1),
  courseId: z.string().min(1),
});

export async function saveRosterAction(
  _prev: AttendanceFormState,
  formData: FormData,
): Promise<AttendanceFormState> {
  const session = await getServerSession();
  const parsed = MarkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };

  // status-<userId> fields; anything else is ignored.
  const marks: Array<{ userId: string; status: "present" | "absent" | "late" }> = [];
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string" || !key.startsWith("status-")) continue;
    if (value !== "present" && value !== "absent" && value !== "late") {
      return { error: "Mark every student as present, absent, or late." };
    }
    marks.push({ userId: key.slice("status-".length), status: value });
  }
  if (marks.length === 0) return { error: "Nothing to save." };

  try {
    await saveRoster(session, parsed.data.sessionId, { marks });
    revalidatePath(`/courses/${parsed.data.courseId}/attendance/${parsed.data.sessionId}`);
    revalidatePath(`/courses/${parsed.data.courseId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[attendance:save]", err);
    return { error: "Could not save attendance." };
  }
}

const CloseSchema = z.object({
  sessionId: z.string().min(1),
  courseId: z.string().min(1),
  closed: z.string(),
});

export async function closeSessionAction(
  _prev: AttendanceFormState,
  formData: FormData,
): Promise<AttendanceFormState> {
  const session = await getServerSession();
  const parsed = CloseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await setSessionClosed(session, parsed.data.sessionId, parsed.data.closed === "true");
    revalidatePath(`/courses/${parsed.data.courseId}/attendance/${parsed.data.sessionId}`);
    revalidatePath(`/courses/${parsed.data.courseId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[attendance:close]", err);
    return { error: "Could not update the session." };
  }
}

const ThresholdSchema = z.object({
  courseId: z.string().min(1),
  threshold: z.string(),
});

export async function setThresholdAction(
  _prev: AttendanceFormState,
  formData: FormData,
): Promise<AttendanceFormState> {
  const session = await getServerSession();
  const parsed = ThresholdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await setCourseThreshold(session, parsed.data.courseId, Number(parsed.data.threshold));
    revalidatePath(`/courses/${parsed.data.courseId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[attendance:threshold]", err);
    return { error: "Could not save the threshold." };
  }
}
