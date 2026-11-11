"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getServerSession } from "@/modules/auth/session";
import { AppError } from "@/modules/shared/errors";
import { updateMaterial } from "@/modules/materials/service";

/**
 * Server actions for course materials (metadata edits + hide/restore).
 * Uploads and downloads go through the REST routes (signed browser upload).
 */

export type MaterialFormState = { error?: string; ok?: boolean };

const ToggleSchema = z.object({
  id: z.string().min(1),
  hidden: z.enum(["true", "false"]),
});

export async function toggleMaterialAction(
  _prev: MaterialFormState,
  formData: FormData,
): Promise<MaterialFormState> {
  const session = await getServerSession();
  const parsed = ToggleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await updateMaterial(session, parsed.data.id, { hidden: parsed.data.hidden === "true" });
    revalidatePath("/courses");
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[materials:toggle]", err);
    return { error: "Could not update the material." };
  }
}
