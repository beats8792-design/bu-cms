"use client";

import { useActionState, useRef } from "react";
import { dropAction, enrollAction, manualEnrollAction, type FormState } from "@/modules/academic/actions";
import { Button, ConfirmButton, Notice } from "@/components/ui";

export function EnrollButton({ courseId, disabled, label }: { courseId: string; disabled?: boolean; label?: string }) {
  const [state, formAction, pending] = useActionState(enrollAction, {} as FormState);
  return (
    <form action={formAction} className="inline-flex flex-col gap-2">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <input type="hidden" name="courseId" value={courseId} />
      <Button
        type="submit"
        disabled={pending || disabled}
        aria-busy={pending || undefined}
      >
        {pending ? "Enrolling…" : (label ?? "Enroll")}
      </Button>
    </form>
  );
}

export function DropButton({ courseId, userId, small }: { courseId: string; userId?: string; small?: boolean }) {
  const [state, formAction, pending] = useActionState(dropAction, {} as FormState);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={formAction} className="inline-flex flex-col gap-2">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <input type="hidden" name="courseId" value={courseId} />
      {userId ? <input type="hidden" name="userId" value={userId} /> : null}
      <ConfirmButton
        confirm="Drop this course? Your attendance and submission history for it will no longer be updated."
        onConfirm={() => formRef.current?.requestSubmit()}
        pending={pending}
        busyLabel="Dropping…"
        variant={small ? "dangerLink" : "danger"}
        size={small ? "sm" : "md"}
      >
        Drop
      </ConfirmButton>
    </form>
  );
}

export function ManualEnrollForm({ courseId }: { courseId: string }) {
  const [state, formAction, pending] = useActionState(manualEnrollAction, {} as FormState);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
      {state.error ? <Notice tone="danger" className="w-full">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success" className="w-full">Student enrolled.</Notice> : null}
      <input type="hidden" name="courseId" value={courseId} />
      <label className="text-sm font-medium">
        Student email
        <input
          name="email"
          type="email"
          required
          placeholder="name@versity.edu"
          className="mt-1 block w-64 rounded-lg border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
      <label className="text-sm font-medium">
        Section
        <input
          name="section"
          defaultValue="A"
          className="mt-1 block w-20 rounded-lg border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
      <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
        {pending ? "Enrolling…" : "Enroll student"}
      </Button>
    </form>
  );
}
