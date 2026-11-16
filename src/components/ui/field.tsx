/**
 * Field/input primitives (DESIGN.md §4/§5): inputs and selects are 8px
 * radius with a 2px primary focus ring; buttons stay 6px. One source of
 * truth so no screen drifts back to unfocused ring-less copies.
 */

export const inputClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-primary";

/** Compact inputs inside dense rows (schedule slots, marks grids). */
export const compactInputClass =
  "rounded-lg border border-border bg-surface px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary";

export const selectClass = inputClass;

export const textareaClass = inputClass;

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

/** Wrapping <label> so the control inside is always labelled (DESIGN §7). */
export function Field({ label, hint, children, className }: FieldProps) {
  return (
    <label className={`text-sm font-medium${className ? ` ${className}` : ""}`}>
      {label}
      {hint ? <span className="ml-1 font-normal text-muted">({hint})</span> : null}
      {children}
    </label>
  );
}
