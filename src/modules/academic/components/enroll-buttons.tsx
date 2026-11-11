"use client";

import { useActionState } from "react";
import { dropAction, enrollAction, manualEnrollAction, type FormState } from "@/modules/academic/actions";

export function EnrollButton({ courseId, disabled, label }: { courseId: string; disabled?: boolean; label?: string }) {
  const [state, formAction, pending] = useActionState(enrollAction, {} as FormState);
  return (
    <form action={formAction} className="inline-flex flex-col gap-2">
      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
      ) : null}
      <input type="hidden" name="courseId" value={courseId} />
      <button
        type="submit"
        disabled={pending || disabled}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Enrolling…" : (label ?? "Enroll")}
      </button>
    </form>
  );
}

export function DropButton({ courseId, userId, small }: { courseId: string; userId?: string; small?: boolean }) {
  const [state, formAction, pending] = useActionState(dropAction, {} as FormState);
  return (
    <form action={formAction} className="inline-flex flex-col gap-2">
      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
      ) : null}
      <input type="hidden" name="courseId" value={courseId} />
      {userId ? <input type="hidden" name="userId" value={userId} /> : null}
      <button
        type="submit"
        disabled={pending}
        className={
          small
            ? "text-danger underline disabled:opacity-60"
            : "rounded-md border border-danger px-4 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
        }
      >
        {pending ? "…" : "Drop"}
      </button>
    </form>
  );
}

export function ManualEnrollForm({ courseId }: { courseId: string }) {
  const [state, formAction, pending] = useActionState(manualEnrollAction, {} as FormState);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      {state.error ? (
        <p role="alert" className="w-full rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p className="w-full rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-hover">Student enrolled.</p>
      ) : null}
      <input type="hidden" name="courseId" value={courseId} />
      <label className="text-sm font-medium">
        Student email
        <input name="email" type="email" required className="mt-1 rounded-md border border-border px-3 py-2" />
      </label>
      <label className="text-sm font-medium">
        Section
        <input name="section" defaultValue="A" className="mt-1 w-20 rounded-md border border-border px-3 py-2" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Enrolling…" : "Enroll student"}
      </button>
    </form>
  );
}
