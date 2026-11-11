"use client";

import { useActionState } from "react";
import { changePasswordAction, type ChangePasswordState } from "@/modules/auth/actions";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, {} as ChangePasswordState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-hover">
          Password changed. Other signed-in devices were signed out.
        </p>
      ) : null}

      <label className="text-sm font-medium">
        Current password
        <input
          type="password"
          name="currentPassword"
          required
          autoComplete="current-password"
          className="mt-1 w-full rounded-md border border-border px-3 py-2"
        />
      </label>
      <label className="text-sm font-medium">
        New password <span className="text-muted">(min. 8 characters)</span>
        <input
          type="password"
          name="newPassword"
          required
          minLength={8}
          autoComplete="new-password"
          className="mt-1 w-full rounded-md border border-border px-3 py-2"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary-soft disabled:opacity-60"
      >
        {pending ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
