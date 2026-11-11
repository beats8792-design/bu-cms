"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerSession } from "@/modules/auth/session";
import { AppError } from "@/modules/shared/errors";
import {
  createAnnouncement,
  deleteAnnouncement,
  setPinned,
  updateAnnouncement,
} from "@/modules/announcements/service";

/** Announcements server actions (post/edit/pin/delete). */

export type AnnouncementFormState = { error?: string; ok?: boolean; id?: string };

const IdSchema = z.object({ id: z.string().min(1) });

export async function createAnnouncementAction(
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const session = await getServerSession();
  try {
    const id = await createAnnouncement(session, Object.fromEntries(formData));
    revalidatePath("/announcements");
    revalidatePath("/cr");
    return { ok: true, id };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[announcements:create]", err);
    return { error: "Could not post the announcement." };
  }
}

export async function updateAnnouncementAction(
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const session = await getServerSession();
  const parsed = IdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await updateAnnouncement(session, parsed.data.id, Object.fromEntries(formData));
    revalidatePath("/announcements");
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[announcements:update]", err);
    return { error: "Could not update the announcement." };
  }
}

export async function togglePinAction(
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const session = await getServerSession();
  const parsed = z
    .object({ id: z.string().min(1), pinned: z.string() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await setPinned(session, parsed.data.id, parsed.data.pinned === "true");
    revalidatePath("/announcements");
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[announcements:pin]", err);
    return { error: "Could not update the pin." };
  }
}

export async function deleteAnnouncementAction(
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const session = await getServerSession();
  const parsed = IdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await deleteAnnouncement(session, parsed.data.id);
    revalidatePath("/announcements");
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[announcements:delete]", err);
    return { error: "Could not delete the announcement." };
  }
}
