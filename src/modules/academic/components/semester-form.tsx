"use client";

import { useState } from "react";
import {
  createSemesterAction,
  toggleWindowAction,
  updateSemesterAction,
  type FormState,
} from "@/modules/academic/actions";
import { FormAlert, Field, inputClass, SubmitButton, useAcademicForm } from "@/modules/academic/form-kit";
import { Button } from "@/components/ui";
import type { Semester } from "@/modules/academic/schema";

export function SemesterForm({ semester }: { semester?: Semester }) {
  const editing = Boolean(semester);
  const [state, formAction, pending] = useAcademicForm(
    editing ? updateSemesterAction : createSemesterAction,
  );
  const [showForm, setShowForm] = useState(!editing);

  if (!showForm) {
    return (
      <Button onClick={() => setShowForm(true)}>Add semester</Button>
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
          className="size-4"
        />
        Enrollment window open (students can self-enroll)
      </label>
      <div className="flex gap-2">
        <SubmitButton pending={pending} label={editing ? "Save changes" : "Create semester"} />
        {editing ? (
          <Button variant="secondary" size="md" onClick={() => setShowForm(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function WindowToggle({ semester }: { semester: Semester }) {
  const [state, formAction, pending] = useAcademicForm(toggleWindowAction);
  const open = semester.enrollmentOpen;
  return (
    <div className="flex flex-col items-start gap-1">
      <form action={formAction} className="inline-flex items-center gap-2">
        <input type="hidden" name="id" value={semester.id} />
        <input type="hidden" name="open" value={open ? "closed" : "open"} />
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {pending ? "Updating…" : open ? "Window open — close it" : "Window closed — open it"}
        </Button>
      </form>
      <FormAlert state={state as FormState} />
    </div>
  );
}
