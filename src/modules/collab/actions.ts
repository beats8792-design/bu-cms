"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerSession } from "@/modules/auth/session";
import { AppError } from "@/modules/shared/errors";
import { createNote, deleteNote, setNotePinned } from "@/modules/collab/notes";
import { createResource, deleteResource, setResourceApproved } from "@/modules/collab/library";
import {
  createGroup,
  deleteGroup,
  joinGroup,
  leaveGroup,
  removeMember,
  saveGroupNotes,
} from "@/modules/collab/groups";

/**
 * Collaboration server actions (Phase 8). File bytes go browser→Cloudinary
 * via /api/uploads/sign (kinds note / library); only metadata lands here.
 */

export type CollabFormState = { error?: string; ok?: boolean; id?: string };

const NoteActionSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(3).max(160),
  publicId: z.string().min(3),
  fileName: z.string().min(1),
  size: z.string(),
});

export async function createNoteAction(
  _prev: CollabFormState,
  formData: FormData,
): Promise<CollabFormState> {
  const session = await getServerSession();
  const parsed = NoteActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Give the note a title and attach a file." };
  try {
    const id = await createNote(session, {
      courseId: parsed.data.courseId,
      title: parsed.data.title,
      file: {
        publicId: parsed.data.publicId,
        fileName: parsed.data.fileName,
        size: Number(parsed.data.size),
      },
    });
    revalidatePath(`/courses/${parsed.data.courseId}`);
    return { ok: true, id };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[collab:note:create]", err);
    return { error: "Could not publish the note." };
  }
}

const IdSchema = z.object({ id: z.string().min(1) });

export async function deleteNoteAction(
  _prev: CollabFormState,
  formData: FormData,
): Promise<CollabFormState> {
  const session = await getServerSession();
  const parsed = z
    .object({ id: z.string().min(1), courseId: z.string().min(1).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await deleteNote(session, parsed.data.id);
    if (parsed.data.courseId) revalidatePath(`/courses/${parsed.data.courseId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[collab:note:delete]", err);
    return { error: "Could not delete the note." };
  }
}

export async function toggleNotePinAction(
  _prev: CollabFormState,
  formData: FormData,
): Promise<CollabFormState> {
  const session = await getServerSession();
  const parsed = z
    .object({ id: z.string().min(1), pinned: z.string() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await setNotePinned(session, parsed.data.id, parsed.data.pinned === "true");
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[collab:note:pin]", err);
    return { error: "Could not update the pin." };
  }
}

/* ------------------------------------------------------------------ library */

const LibraryActionSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(1000).default(""),
  kind: z.enum(["past-paper", "guide", "other"]),
  departmentId: z.string().trim().max(60).default(""),
  courseId: z.string().trim().max(60).default(""),
  semesterId: z.string().trim().max(60).default(""),
  publicId: z.string().min(3),
  fileName: z.string().min(1),
  size: z.string(),
});

export async function createResourceAction(
  _prev: CollabFormState,
  formData: FormData,
): Promise<CollabFormState> {
  const session = await getServerSession();
  const parsed = LibraryActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Fill the title, kind and attach a file." };
  try {
    const id = await createResource(session, {
      title: parsed.data.title,
      description: parsed.data.description,
      kind: parsed.data.kind,
      departmentId: parsed.data.departmentId,
      courseId: parsed.data.courseId,
      semesterId: parsed.data.semesterId,
      file: {
        publicId: parsed.data.publicId,
        fileName: parsed.data.fileName,
        size: Number(parsed.data.size),
      },
    });
    revalidatePath("/library");
    return { ok: true, id };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[collab:library:create]", err);
    return { error: "Could not publish the resource." };
  }
}

export async function deleteResourceAction(
  _prev: CollabFormState,
  formData: FormData,
): Promise<CollabFormState> {
  const session = await getServerSession();
  const parsed = IdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await deleteResource(session, parsed.data.id);
    revalidatePath("/library");
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[collab:library:delete]", err);
    return { error: "Could not delete the resource." };
  }
}

export async function approveResourceAction(
  _prev: CollabFormState,
  formData: FormData,
): Promise<CollabFormState> {
  const session = await getServerSession();
  const parsed = z
    .object({ id: z.string().min(1), approved: z.string() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await setResourceApproved(session, parsed.data.id, parsed.data.approved === "true");
    revalidatePath("/library");
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[collab:library:approve]", err);
    return { error: "Could not update moderation." };
  }
}

/* ------------------------------------------------------------ study groups */

const GroupActionSchema = z.object({
  courseId: z.string().min(1),
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(500).default(""),
});

export async function createGroupAction(
  _prev: CollabFormState,
  formData: FormData,
): Promise<CollabFormState> {
  const session = await getServerSession();
  const parsed = GroupActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const id = await createGroup(session, parsed.data);
    revalidatePath("/groups");
    return { ok: true, id };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[collab:group:create]", err);
    return { error: "Could not create the group." };
  }
}

export async function joinGroupAction(
  _prev: CollabFormState,
  formData: FormData,
): Promise<CollabFormState> {
  const session = await getServerSession();
  const parsed = IdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await joinGroup(session, parsed.data.id);
    revalidatePath("/groups");
    revalidatePath(`/groups/${parsed.data.id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[collab:group:join]", err);
    return { error: "Could not join the group." };
  }
}

export async function leaveGroupAction(
  _prev: CollabFormState,
  formData: FormData,
): Promise<CollabFormState> {
  const session = await getServerSession();
  const parsed = IdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await leaveGroup(session, parsed.data.id);
    revalidatePath("/groups");
    revalidatePath(`/groups/${parsed.data.id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[collab:group:leave]", err);
    return { error: "Could not leave the group." };
  }
}

export async function removeMemberAction(
  _prev: CollabFormState,
  formData: FormData,
): Promise<CollabFormState> {
  const session = await getServerSession();
  const parsed = z
    .object({ id: z.string().min(1), memberId: z.string().min(1) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await removeMember(session, parsed.data.id, parsed.data.memberId);
    revalidatePath(`/groups/${parsed.data.id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[collab:group:remove]", err);
    return { error: "Could not remove the member." };
  }
}

export async function deleteGroupAction(
  _prev: CollabFormState,
  formData: FormData,
): Promise<CollabFormState> {
  const session = await getServerSession();
  const parsed = IdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await deleteGroup(session, parsed.data.id);
    revalidatePath("/groups");
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[collab:group:delete]", err);
    return { error: "Could not delete the group." };
  }
}

const NotepadSchema = z.object({
  id: z.string().min(1),
  notes: z.string(),
});

export async function saveGroupNotesAction(
  _prev: CollabFormState,
  formData: FormData,
): Promise<CollabFormState> {
  const session = await getServerSession();
  const parsed = NotepadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await saveGroupNotes(session, parsed.data.id, parsed.data.notes);
    revalidatePath(`/groups/${parsed.data.id}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[collab:group:notes]", err);
    return { error: "Could not save the notepad." };
  }
}
