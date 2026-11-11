"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { parseImportCsv, type ImportRow } from "@/modules/admin/csv";
import {
  PAGE_SIZE,
  importUsers,
  listUsers,
  markEmailVerified,
  setUserRole,
  transitionUser,
  type ImportSummary,
} from "@/modules/admin/users";
import type { Role } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import { getServerSession } from "@/modules/auth/session";

export type ListParams = { search?: string; status?: string; role?: string; page?: number };

export async function listUsersData(params: ListParams) {
  const session = await getServerSession();
  const result = await listUsers(session ?? null, {
    search: params.search,
    status: params.status,
    role: params.role,
    page: params.page ?? 1,
  });
  return { ...result, pageSize: PAGE_SIZE };
}

/** Returns a plain error message for form display, never leaks internals. */
export type AdminActionState = { error?: string; summary?: ImportSummary; ok?: boolean };

const TransitionSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  transition: z.enum(["approve", "suspend", "reactivate"]),
});

export async function userTransitionAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const session = await getServerSession();
  const parsed = TransitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await transitionUser(session ?? null, parsed.data.email, parsed.data.transition);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[admin transition]", err);
    return { error: "Could not update the account right now." };
  }
}

const RoleSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["admin", "teacher", "cr", "student", "alumni"]),
});

export async function setRoleAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const session = await getServerSession();
  const parsed = RoleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await setUserRole(session ?? null, parsed.data.email, parsed.data.role as Role);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[admin setRole]", err);
    return { error: "Could not update the role right now." };
  }
}

const VerifySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export async function markVerifiedAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const session = await getServerSession();
  const parsed = VerifySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Bad request." };
  try {
    await markEmailVerified(session ?? null, parsed.data.email);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[admin verify]", err);
    return { error: "Could not mark email verified right now." };
  }
}

const CsvSchema = z.object({ csv: z.string().min(1) });

export async function importCsvAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const session = await getServerSession();
  const parsed = CsvSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Paste CSV content or choose a file." };

  const { rows, skipped, duplicatesInFile }: { rows: ImportRow[]; skipped: { index: number; reason: string }[]; duplicatesInFile: number } =
    parseImportCsv(parsed.data.csv);
  if (rows.length === 0) return { error: "No importable rows found. Check the header (name, email)." };

  try {
    const summary = await importUsers(session ?? null, rows);
    revalidatePath("/admin/users");
    revalidatePath("/admin/users/import");
    return { summary: { ...summary, skipped, duplicatesInFile }, ok: true };
  } catch (err) {
    if (err instanceof AppError) return { error: err.message };
    console.error("[admin import]", err);
    return { error: "Import failed. Please try again." };
  }
}
