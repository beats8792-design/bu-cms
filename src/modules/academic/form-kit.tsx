"use client";

import { useActionState } from "react";
import type { FormState } from "@/modules/academic/actions";

/**
 * Minimal form primitives following DESIGN.md §4/§5 (white cards, 1px border,
 * rounded-lg inputs, danger error text, 120–180ms transitions).
 */

export function FormAlert({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-hover">Saved.</p>
    );
  }
  return null;
}

export const inputClass =
  "mt-1 w-full rounded-md border border-border px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      {hint ? <span className="ml-1 font-normal text-muted">({hint})</span> : null}
      {children}
    </label>
  );
}

export function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-primary-hover disabled:opacity-60"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

/** Wraps useActionState for the common server-action + FormState pattern. */
export function useAcademicForm(
  action: (prev: FormState, formData: FormData) => Promise<FormState>,
) {
  return useActionState(action, {} as FormState);
}
