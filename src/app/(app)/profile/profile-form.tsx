"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileState } from "@/modules/auth/actions";
import { Button, Notice, inputClass } from "@/components/ui";

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
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">Profile saved.</Notice> : null}

      <label className="text-sm font-medium">
        Full name
        <input name="name" defaultValue={name} required minLength={2} className={inputClass} />
      </label>
      <label className="text-sm font-medium">
        Display name <span className="text-muted">(shown in class)</span>
        <input name="displayName" defaultValue={displayName} className={inputClass} />
      </label>
      {canEditStudentId ? (
        <label className="text-sm font-medium">
          Student ID
          <input name="studentId" defaultValue={studentId} className={inputClass} />
        </label>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        className="self-start"
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
