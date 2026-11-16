"use client";

import { useActionState, useState } from "react";
import { registerAction, type RegisterState } from "@/modules/auth/actions";
import { Button, ButtonLink, Notice, inputClass } from "@/components/ui";

const initial: RegisterState = {};

export function RegisterForm({ mailerOn }: { mailerOn: boolean }) {
  const [state, formAction, pending] = useActionState(registerAction, initial);
  const [role, setRole] = useState("student");

  if (state.verify) {
    return (
      <div className="flex flex-col gap-4 text-sm">
        <Notice tone="success">
          Account created! We sent a verification email — confirm it, then wait
          while an administrator approves your access.
        </Notice>
        <ButtonLink href="/login" variant="primary" className="self-start">
          Sign in
        </ButtonLink>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {!mailerOn ? (
        <Notice tone="warn" className="text-xs">
          Email service isn&apos;t configured — accounts are created without email verification.
        </Notice>
      ) : null}

      <label className="text-sm font-medium">
        Full name
        <input name="name" required minLength={2} className={inputClass} />
      </label>
      <label className="text-sm font-medium">
        Email
        <input name="email" type="email" required className={inputClass} autoComplete="email" />
      </label>
      <label className="text-sm font-medium">
        Password
        <input name="password" type="password" required minLength={8} className={inputClass} autoComplete="new-password" />
      </label>
      <label className="text-sm font-medium">
        Role
        <select
          name="role"
          required
          className={inputClass}
          defaultValue="student"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="alumni">Alumni</option>
        </select>
      </label>
      {role === "student" || role === "cr" ? (
        <label className="text-sm font-medium">
          Student ID <span className="text-muted">(students only)</span>
          <input name="studentId" className={inputClass} />
        </label>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? "Creating…" : "Create account"}
      </Button>
      <p className="text-xs text-muted">
        New accounts wait for administrator approval before the app opens.
      </p>
    </form>
  );
}
