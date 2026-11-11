"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerSession } from "@/modules/auth/session";
import { AppError } from "@/modules/shared/errors";
import { dhakaToIso } from "@/modules/assignments/schema";
import {
  createAssignment,
  deleteAssignment,
  grade,
  submit,
  updateAssignment,
} from "@/modules/assignments/service";
import { listAssignmentsByCourse } from "@/modules/assignments/service";

/**
 * Server actions for assignments. File bytes go browser→Cloudinary via the
 * signed route; only metadata flows through these actions.
 */

export type AssignmentFormState = { error?: string; ok?: boolean; id?: string };

/** Accepts the raw form; converts date+time (Dhaka) into the ISO deadline. */
function buildInput(raw: Record<string, unknown>, formData: FormData): unknown {
  const attachments = formData.getAll("attachment").filter((v): v is string => typeof v === "string");
  const attachmentNames = formData.getAll("attachmentName").filter((v): v is string => typeof v === "string");
  const attachmentSizes = formData.getAll("attachmentSize").filter((v): v is string => typeof v === "string");
  return {
    ...raw,
    points: Number(raw.points),
    deadline: dhakaToIso(String(raw.deadlineDate ?? ""), String(raw.deadlineTime ?? "")),
    latePolicy: formData.get("latePolicy") === "block" ? "block" : "allow",
    attachments: attachments
      .map((publicId, i) => ({
        publicId,
        fileName: attachmentNames[i] ?? "attachment",
        size: Number(attachmentSizes[i] ?? 0),
      }))
      .filter((a) => a.publicId && a.size > 0),
  };
}

const IdSchema = z.object({ courseId: z.string().min(1), id: z.string().optional() });

export async function createAssignmentAction(
  _prev: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const session = await getServerSession();
  const parsed = IdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Missing course." };
  try {
    const input = buildInput(Object.fromEntries(formData), formData);
    const id = await createAssignment(session, {
      ...(input as Record<string, unknown>),
      courseId: parsed.data.courseId,
    });
    revalidatePath(`/courses/${parsed.data.courseId}`);
    return { ok: true, id };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[assignments:create]", err);
    return { error: "Could not create the assignment." };
  }
}

export async function updateAssignmentAction(
  _prev: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const session = await getServerSession();
  const parsed = IdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !parsed.data.id) return { error: "Missing assignment." };
  try {
    await updateAssignment(session, parsed.data.id, buildInput(Object.fromEntries(formData), formData));
    revalidatePath(`/courses/${parsed.data.courseId}`);
    revalidatePath(`/courses/${parsed.data.courseId}/assignments/${parsed.data.id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[assignments:update]", err);
    return { error: "Could not update the assignment." };
  }
}

export async function deleteAssignmentAction(
  _prev: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const session = await getServerSession();
  const parsed = z
    .object({ id: z.string().min(1), courseId: z.string().min(1) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await deleteAssignment(session, parsed.data.id);
    revalidatePath(`/courses/${parsed.data.courseId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[assignments:delete]", err);
    return { error: "Could not delete the assignment." };
  }
}

/* --------------------------------------------------------------- submission */

const SubmitSchema = z.object({
  assignmentId: z.string().min(1),
  courseId: z.string().min(1),
  note: z.string().trim().max(2000).default(""),
});

export async function submitAssignmentAction(
  _prev: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const session = await getServerSession();
  const parsed = SubmitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };

  const publicIds = formData.getAll("file").filter((v): v is string => typeof v === "string");
  const fileNames = formData.getAll("fileName").filter((v): v is string => typeof v === "string");
  const fileSizes = formData.getAll("fileSize").filter((v): v is string => typeof v === "string");
  const files = publicIds
    .map((publicId, i) => ({
      publicId,
      fileName: fileNames[i] ?? "file",
      size: Number(fileSizes[i] ?? 0),
    }))
    .filter((f) => f.publicId && f.size > 0);

  try {
    const user = session!.user as { id: string; role: string };
    const result = await submit({
      assignmentId: parsed.data.assignmentId,
      userId: user.id,
      role: user.role,
      files,
      note: parsed.data.note,
    });
    revalidatePath(`/courses/${parsed.data.courseId}/assignments/${parsed.data.assignmentId}`);
    return {
      ok: true,
      ...(result.isLate ? { error: undefined } : {}),
    };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[assignments:submit]", err);
    return { error: "Could not submit. Please try again." };
  }
}

/* ------------------------------------------------------------------ grading */

const GradeSchema = z.object({
  assignmentId: z.string().min(1),
  courseId: z.string().min(1),
  userId: z.string().min(1),
  score: z.string().optional(),
  feedback: z.string().trim().max(2000).default(""),
});

export async function gradeAction(
  _prev: AssignmentFormState,
  formData: FormData,
): Promise<AssignmentFormState> {
  const session = await getServerSession();
  const parsed = GradeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  const rawScore = (parsed.data.score ?? "").trim();
  const score = rawScore === "" ? null : Number(rawScore);
  try {
    await grade(session, parsed.data.assignmentId, parsed.data.userId, score, parsed.data.feedback);
    revalidatePath(`/courses/${parsed.data.courseId}/assignments/${parsed.data.assignmentId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[assignments:grade]", err);
    return { error: "Could not save the grade." };
  }
}

/* ------------------------------------------------------------------ listing */

export async function listAssignmentsData(courseId: string) {
  const session = await getServerSession();
  return listAssignmentsByCourse(session ?? null, courseId);
}
