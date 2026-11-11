"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/modules/auth/server";
import { appGate } from "@/modules/auth/session";
import { getDb } from "@/lib/db";

/**
 * Registration + profile server actions. Password sign-in stays on the
 * BetterAuth client (/api/auth). Registration happens server-side so we can
 * set role/status (additionalFields are input:false, never client-settable).
 */

const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
  role: z.enum(["student", "teacher", "alumni"]), // CR & admin are granted by admins only
  studentId: z.string().trim().max(24).optional(),
});

export type RegisterState = { error?: string; verify?: boolean };

export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const parsed = RegisterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: registerValidationMessage(issue.path[0]?.toString() ?? "form") };
  }
  const { name, email, password, role, studentId } = parsed.data;

  const auth = await getAuth();
  const h = await headers();

  try {
    await auth.api.signUpEmail({
      body: { name, email, password },
      headers: h,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("USER_ALREADY_EXISTS")) {
      return { error: "An account with this email already exists. Try signing in instead." };
    }
    console.error("[register]", message);
    return { error: "Could not create your account right now. Please try again." };
  }

  // Set custom fields server-side. email is unique — save filter over _id.
  const db = await getDb();
  await db.collection("user").updateOne(
    { email },
    { $set: { role, status: "pending", studentId: studentId || "" } },
  );

  // When the mailer is active, signUpEmail already dispatched verification mail.
  if (process.env.RESEND_API_KEY) return { verify: true };
  redirect("/pending");
}

function registerValidationMessage(field: string): string {
  const map: Record<string, string> = {
    name: "Please enter your full name.",
    email: "Please enter a valid email address.",
    password: "Password must be at least 8 characters.",
    role: "Please choose a role.",
    studentId: "Student ID looks too long.",
    form: "Please fill out the form correctly.",
  };
  return map[field] ?? "Please check the form and try again.";
}

/* ------------------------------------------------------------- password */

export type ChangePasswordState = { error?: string; ok?: boolean };

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const parsed = ChangePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "New password must be at least 8 characters." };
  }
  const { currentPassword, newPassword } = parsed.data;
  if (currentPassword === newPassword) {
    return { error: "The new password must be different from the current one." };
  }

  const auth = await getAuth();
  const h = await headers();
  try {
    // Revokes every other device's session; the current session survives.
    await auth.api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers: h,
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[changePassword]", message);
    if (/INVALID_PASSWORD|invalid password/i.test(message)) {
      return { error: "Current password is incorrect." };
    }
    if (/UNAUTHORIZED|session/i.test(message)) {
      return { error: "Please sign in again and retry." };
    }
    return { error: "Could not change the password right now." };
  }
}

/* ------------------------------------------------------------- profile */

export type ProfileState = { error?: string; ok?: boolean };

const ProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  displayName: z.string().trim().max(80).optional(),
  studentId: z.string().trim().max(24).optional(),
});

export async function updateProfileAction(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const session = await appGate();
  const parsed = ProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please check the fields and try again." };

  const { name, displayName, studentId } = parsed.data;
  const $set: Record<string, string> = {};
  if (typeof name === "string") $set.name = name;
  if (typeof displayName === "string") $set.displayName = displayName;
  if (
    typeof studentId === "string" &&
    (session.user.role === "student" || session.user.role === "cr")
  ) {
    $set.studentId = studentId;
  }
  if (Object.keys($set).length === 0) return { error: "Nothing to update." };

  const db = await getDb();
  await db.collection("user").updateOne({ email: session.user.email }, { $set });
  revalidatePath("/profile");
  return { ok: true };
}
