"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerSession } from "@/modules/auth/session";
import { AppError } from "@/modules/shared/errors";
import { createDepartment, updateDepartment } from "@/modules/academic/departments";
import {
  createSemester,
  setEnrollmentWindow,
  updateSemester,
} from "@/modules/academic/semesters";
import { createCourse, setCourseTeachers, updateCourse } from "@/modules/academic/courses";
import { drop, manualEnroll, selfEnroll } from "@/modules/academic/enrollment";
import { createEvent } from "@/modules/academic/calendar";

/**
 * Server actions for the academic core. Every action re-reads the session and
 * enforces RBAC inside the service — never trust the calling page alone.
 */

export type FormState = { error?: string; ok?: boolean; id?: string };

/** Turns a FormData into a plain object, keeping multi-value keys as arrays. */
function readForm(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (key.endsWith("[]")) {
      const base = key.slice(0, -2);
      const list = Array.isArray(out[base]) ? (out[base] as string[]) : [];
      if (value !== "") list.push(value);
      out[base] = list;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function coerceNumbers(input: Record<string, unknown>, fields: string[]): void {
  for (const f of fields) {
    if (typeof input[f] === "string" && input[f] !== "") input[f] = Number(input[f]);
  }
}

function errState(err: unknown): FormState {
  if (err instanceof AppError) return { error: err.message };
  console.error("[academic action]", err);
  return { error: "Something went wrong. Please try again." };
}

/* ------------------------------------------------------------ departments */

const IdSchema = z.object({ id: z.string().min(1) });

export async function createDepartmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getServerSession();
  try {
    await createDepartment(session ?? null, readForm(formData));
    revalidatePath("/admin/departments");
    return { ok: true };
  } catch (err) {
    return errState(err);
  }
}

export async function updateDepartmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getServerSession();
  const parsed = IdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Missing department." };
  try {
    await updateDepartment(session ?? null, parsed.data.id, readForm(formData));
    revalidatePath("/admin/departments");
    return { ok: true };
  } catch (err) {
    return errState(err);
  }
}

/* -------------------------------------------------------------- semesters */

export async function createSemesterAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getServerSession();
  const raw = readForm(formData);
  raw.enrollmentOpen = formData.get("enrollmentOpen") === "on";
  try {
    await createSemester(session ?? null, raw);
    revalidatePath("/admin/semesters");
    return { ok: true };
  } catch (err) {
    return errState(err);
  }
}

export async function updateSemesterAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getServerSession();
  const parsed = IdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Missing semester." };
  const raw = readForm(formData);
  raw.enrollmentOpen = formData.get("enrollmentOpen") === "on";
  try {
    await updateSemester(session ?? null, parsed.data.id, raw);
    revalidatePath("/admin/semesters");
    return { ok: true };
  } catch (err) {
    return errState(err);
  }
}

export async function toggleWindowAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getServerSession();
  const parsed = z
    .object({ id: z.string().min(1), open: z.enum(["open", "closed"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await setEnrollmentWindow(session ?? null, parsed.data.id, parsed.data.open === "open");
    revalidatePath("/admin/semesters");
    revalidatePath("/courses");
    return { ok: true };
  } catch (err) {
    return errState(err);
  }
}

/* ---------------------------------------------------------------- courses */

export async function createCourseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getServerSession();
  const raw = readForm(formData);
  coerceNumbers(raw, ["credits", "seatLimit"]);
  // Teachers auto-assign themselves; admins start with an empty roster and
  // assign teachers afterwards (setCourseTeachersAction).
  raw.teacherIds =
    (session?.user as { role?: string })?.role === "teacher"
      ? [(session?.user as { id: string }).id]
      : [];
  try {
    const id = await createCourse(session ?? null, raw);
    revalidatePath("/admin/courses");
    revalidatePath("/courses");
    return { ok: true, id };
  } catch (err) {
    return errState(err);
  }
}

export async function updateCourseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getServerSession();
  const parsed = IdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Missing course." };
  const raw = readForm(formData);
  coerceNumbers(raw, ["credits", "seatLimit"]);
  // schedule[] arrives as JSON blob from the editor component
  try {
    if (typeof raw.schedule === "string") raw.schedule = JSON.parse(raw.schedule || "[]");
  } catch {
    return { error: "Schedule data is malformed." };
  }
  try {
    await updateCourse(session ?? null, parsed.data.id, raw);
    revalidatePath(`/courses/${parsed.data.id}`);
    revalidatePath("/schedule");
    return { ok: true };
  } catch (err) {
    return errState(err);
  }
}

export async function setCourseTeachersAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getServerSession();
  const parsed = IdSchema.safeParse(Object.fromEntries(formData));
  const teacherIds = formData.getAll("teacherIds").filter((v): v is string => typeof v === "string");
  if (!parsed.success) return { error: "Missing course." };
  if (teacherIds.length > 10) return { error: "At most 10 teachers per course." };
  try {
    await setCourseTeachers(session ?? null, parsed.data.id, teacherIds);
    revalidatePath(`/courses/${parsed.data.id}`);
    return { ok: true };
  } catch (err) {
    return errState(err);
  }
}

/* ------------------------------------------------------------- enrollment */

const EnrollActionSchema = z.object({
  courseId: z.string().min(1),
  section: z.string().trim().max(8).default("A"),
});

export async function enrollAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getServerSession();
  const parsed = EnrollActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await selfEnroll(session ?? null, parsed.data.courseId, parsed.data.section || "A");
    revalidatePath(`/courses/${parsed.data.courseId}`);
    revalidatePath("/schedule");
    return { ok: true };
  } catch (err) {
    return errState(err);
  }
}

const ManualEnrollSchema = z.object({
  courseId: z.string().min(1),
  email: z.string().trim().toLowerCase().email("Valid student email required"),
  section: z.string().trim().max(8).default("A"),
});

export async function manualEnrollAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getServerSession();
  const parsed = ManualEnrollSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await manualEnroll(session ?? null, parsed.data.courseId, parsed.data.email, parsed.data.section || "A");
    revalidatePath(`/courses/${parsed.data.courseId}`);
    return { ok: true };
  } catch (err) {
    return errState(err);
  }
}

const DropSchema = z.object({ courseId: z.string().min(1), userId: z.string().optional() });

export async function dropAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getServerSession();
  const parsed = DropSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await drop(session ?? null, parsed.data.courseId, parsed.data.userId || undefined);
    revalidatePath(`/courses/${parsed.data.courseId}`);
    revalidatePath("/schedule");
    return { ok: true };
  } catch (err) {
    return errState(err);
  }
}

/* --------------------------------------------------------------- calendar */

export async function createEventAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getServerSession();
  const raw = readForm(formData);
  raw.scope = { type: raw.scopeType, refId: raw.refId ?? "" };
  delete raw.scopeType;
  delete raw.refId;
  try {
    await createEvent(session ?? null, raw);
    revalidatePath("/calendar");
    revalidatePath("/schedule");
    return { ok: true };
  } catch (err) {
    return errState(err);
  }
}
