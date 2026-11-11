"use client";

import { useState } from "react";
import {
  createSemesterAction,
  toggleWindowAction,
  updateSemesterAction,
  type FormState,
} from "@/modules/academic/actions";
import { FormAlert, Field, inputClass, SubmitButton, useAcademicForm } from "@/modules/academic/form-kit";
import type { Semester } from "@/modules/academic/schema";

export function SemesterForm({ semester }: { semester?: Semester }) {
  const editing = Boolean(semester);
  const [state, formAction, pending] = useAcademicForm(
    editing ? updateSemesterAction : createSemesterAction,
  );
  const [showForm, setShowForm] = useState(!editing);

  if (!showForm) {
    return (
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
      >
        Add semester
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <FormAlert state={state as FormState} />
      {editing ? <input type="hidden" name="id" value={semester!.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Academic year" hint="YYYY/YYYY">
          <input
            name="academicYear"
            required
            placeholder="2025/2026"
            defaultValue={semester?.academicYear ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Term">
          <select name="term" defaultValue={semester?.term ?? "Autumn"} className={inputClass}>
            <option value="Spring">Spring</option>
            <option value="Summer">Summer</option>
            <option value="Autumn">Autumn</option>
          </select>
        </Field>
        <Field label="Start date">
          <input type="date" name="startDate" required defaultValue={semester?.startDate ?? ""} className={inputClass} />
        </Field>
        <Field label="End date">
          <input type="date" name="endDate" required defaultValue={semester?.endDate ?? ""} className={inputClass} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="enrollmentOpen"
          defaultChecked={semester?.enrollmentOpen ?? false}
          className="size-4 rounded border-border"
        />
        Enrollment window open (students can self-enroll)
      </label>
      <div className="flex gap-2">
        <SubmitButton pending={pending} label={editing ? "Save changes" : "Create semester"} />
        {editing ? (
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-primary-soft"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function WindowToggle({ semester }: { semester: Semester }) {
  const [state, formAction, pending] = useAcademicForm(toggleWindowAction);
  const open = semester.enrollmentOpen;
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <FormAlert state={state as FormState} />
      <input type="hidden" name="id" value={semester.id} />
      <input type="hidden" name="open" value={open ? "closed" : "open"} />
      <button
        type="submit"
        disabled={pending}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 ${
          open
            ? "bg-primary-soft text-primary-hover hover:bg-warn-soft hover:text-warn"
            : "bg-warn-soft text-warn hover:bg-primary-soft hover:text-primary-hover"
        }`}
      >
        {open ? "Window open — close it" : "Window closed — open it"}
      </button>
    </form>
  );
}
