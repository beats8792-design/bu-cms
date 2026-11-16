"use client";

import { useState } from "react";
import { createDepartmentAction, updateDepartmentAction, type FormState } from "@/modules/academic/actions";
import { FormAlert, Field, inputClass, SubmitButton, useAcademicForm } from "@/modules/academic/form-kit";
import { Button } from "@/components/ui";
import type { Department } from "@/modules/academic/schema";

export function DepartmentForm({ department }: { department?: Department }) {
  const editing = Boolean(department);
  const [state, formAction, pending] = useAcademicForm(
    editing ? updateDepartmentAction : createDepartmentAction,
  );
  const [showForm, setShowForm] = useState(!editing);

  if (!showForm) {
    return (
      <Button onClick={() => setShowForm(true)}>Add department</Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <FormAlert state={state as FormState} />
      {editing ? <input type="hidden" name="id" value={department!.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" hint="e.g. CSE">
          <input name="code" required defaultValue={department?.code ?? ""} className={inputClass} />
        </Field>
        <Field label="Name">
          <input name="name" required defaultValue={department?.name ?? ""} className={inputClass} />
        </Field>
      </div>
      <Field label="Programs offered" hint="comma-separated, e.g. BSc, MSc">
        <input
          name="programList"
          defaultValue={department?.programList?.join(", ") ?? ""}
          className={inputClass}
        />
      </Field>
      <div className="flex gap-2">
        <SubmitButton pending={pending} label={editing ? "Save changes" : "Create department"} />
        {editing ? (
          <Button variant="secondary" size="md" onClick={() => setShowForm(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
