"use client";

import { useActionState } from "react";
import { registerAction, type RegisterState } from "@/modules/auth/actions";

const initial: RegisterState = {};

export function RegisterForm({ mailerOn }: { mailerOn: boolean }) {
  const [state, formAction, pending] = useActionState(registerAction, initial);

  if (state.verify) {
    return (
      <div className="text-sm">
        <p className="rounded-md border border-border bg-surface px-3 py-2">
          Account created! We sent a verification email — confirm it, then wait while an
          administrator approves your access.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? (
        <p role="alert" className="rounded-md border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {!mailerOn ? (
        <p className="rounded-md border border-warn-soft bg-warn-soft px-3 py-2 text-xs text-warn">
          Email service isn&apos;t configured — accounts are created without email verification.
        </p>
      ) : null}

      <label className="text-sm font-medium">
        Full name
        <input name="name" required minLength={2} className="mt-1 w-full rounded-md border border-border px-3 py-2" />
      </label>
      <label className="text-sm font-medium">
        Email
        <input name="email" type="email" required className="mt-1 w-full rounded-md border border-border px-3 py-2" autoComplete="email" />
      </label>
      <label className="text-sm font-medium">
        Password
        <input name="password" type="password" required minLength={8} className="mt-1 w-full rounded-md border border-border px-3 py-2" autoComplete="new-password" />
      </label>
      <label className="text-sm font-medium">
        Role
        <select name="role" required className="mt-1 w-full rounded-md border border-border px-3 py-2" defaultValue="student">
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="alumni">Alumni</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        Student ID <span className="text-muted">(students only)</span>
        <input name="studentId" className="mt-1 w-full rounded-md border border-border px-3 py-2" />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create account"}
      </button>
      <p className="text-xs text-muted">
        New accounts wait for administrator approval before the app opens.
      </p>
    </form>
  );
}
