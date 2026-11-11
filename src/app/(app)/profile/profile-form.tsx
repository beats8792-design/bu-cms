"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileState } from "@/modules/auth/actions";

export function ProfileForm({
  name,
  displayName,
  studentId,
  canEditStudentId,
}: {
  name: string;
  displayName: string;
  studentId: string;
  canEditStudentId: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateProfileAction, {} as ProfileState);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-hover">Profile saved.</p>
      ) : null}

      <label className="text-sm font-medium">
        Full name
        <input name="name" defaultValue={name} required minLength={2} className="mt-1 w-full rounded-md border border-border px-3 py-2" />
      </label>
      <label className="text-sm font-medium">
        Display name <span className="text-muted">(shown in class)</span>
        <input name="displayName" defaultValue={displayName} className="mt-1 w-full rounded-md border border-border px-3 py-2" />
      </label>
      {canEditStudentId ? (
        <label className="text-sm font-medium">
          Student ID
          <input name="studentId" defaultValue={studentId} className="mt-1 w-full rounded-md border border-border px-3 py-2" />
        </label>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
