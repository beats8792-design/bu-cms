"use client";

import { useActionState } from "react";
import { changePasswordAction, type ChangePasswordState } from "@/modules/auth/actions";
import { Button, Notice, inputClass } from "@/components/ui";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, {} as ChangePasswordState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? (
        <Notice tone="success">
          Password changed. Other signed-in devices were signed out.
        </Notice>
      ) : null}

      <label className="text-sm font-medium">
        Current password
        <input
          type="password"
          name="currentPassword"
          required
          autoComplete="current-password"
          className={inputClass}
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
          className={inputClass}
        />
      </label>

      <Button
        type="submit"
        variant="outline"
        className="self-start"
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}
