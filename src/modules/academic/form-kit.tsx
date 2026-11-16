"use client";

import { useActionState } from "react";
import type { FormState } from "@/modules/academic/actions";
import { inputClass, Field, Button, Notice } from "@/components/ui";

/**
 * Thin compatibility layer over the shared UI kit (src/components/ui) for
 * the academic module's form-action pattern. New screens should import the
 * kit directly; this file keeps older call sites working.
 */

export function FormAlert({ state, saved }: { state: FormState; saved?: string }) {
  if (state.error) {
    return <Notice tone="danger">{state.error}</Notice>;
  }
  if (state.ok) {
    return <Notice tone="success">{saved ?? "Saved."}</Notice>;
  }
  return null;
}

export { inputClass, Field };

export function SubmitButton({
  pending,
  label,
  className,
}: {
  pending: boolean;
  label: string;
  className?: string;
}) {
  return (
    <Button type="submit" disabled={pending} aria-busy={pending || undefined} className={className}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/** Wraps useActionState for the common server-action + FormState pattern. */
export function useAcademicForm(
  action: (prev: FormState, formData: FormData) => Promise<FormState>,
) {
  return useActionState(action, {} as FormState);
}
