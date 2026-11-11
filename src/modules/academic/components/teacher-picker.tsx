"use client";

import { useActionState } from "react";
import {
  setCourseTeachersAction,
  type FormState,
} from "@/modules/academic/actions";

/** Admin-only: pick teachers for a course from a searchable checkbox list. */
export function TeacherPicker({
  courseId,
  teachers,
  assigned,
}: {
  courseId: string;
  teachers: { id: string; name: string; email: string }[];
  assigned: string[];
}) {
  const [state, formAction, pending] = useActionState(setCourseTeachersAction, {} as FormState);
  const assignedSet = new Set(assigned);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-hover">Teachers updated.</p>
      ) : null}
      <input type="hidden" name="id" value={courseId} />
      <p className="text-sm font-medium">Assigned teachers</p>
      {teachers.length === 0 ? (
        <p className="text-sm text-muted">No teachers exist yet — they register and get approved first.</p>
      ) : (
        <div className="grid max-h-48 gap-1 overflow-auto sm:grid-cols-2">
          {teachers.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="teacherIds"
                value={t.id}
                defaultChecked={assignedSet.has(t.id)}
                className="size-4 rounded border-border"
              />
              <span>
                {t.name} <span className="text-muted">· {t.email}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save teachers"}
      </button>
    </form>
  );
}
