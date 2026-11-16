"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "./button";

/**
 * Modal dialog (DESIGN.md §4: floating layer gets shadow-floating; §7:
 * keyboard traversal). Trigger button + labelled dialog with backdrop,
 * Escape/backdrop close, scroll lock, focus on open, simple Tab trap and
 * focus restored to the trigger on close.
 */

export interface ModalButtonProps {
  /** Trigger label. */
  label: string;
  /** Dialog heading; defaults to label. */
  title?: string;
  /** Optional one-line guidance under the heading. */
  description?: string;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerClassName?: string;
  /** Panel width: md = max-w-lg, lg = max-w-2xl (wide forms). */
  size?: "md" | "lg";
  children: React.ReactNode;
}

export function ModalButton({
  label,
  title,
  description,
  triggerVariant = "primary",
  triggerSize = "md",
  triggerClassName,
  size = "md",
  children,
}: ModalButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        return;
      }
      // Minimal Tab trap: keep focus inside the dialog while open.
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  const panelWidth = size === "lg" ? "max-w-2xl" : "max-w-lg";

  return (
    <>
      <Button
        type="button"
        ref={triggerRef}
        aria-haspopup="dialog"
        aria-expanded={open}
        variant={triggerVariant}
        size={triggerSize}
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-ink/40"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={headingId}
              tabIndex={-1}
              className={`mt-8 w-full ${panelWidth} rounded-lg border border-border bg-surface p-5 shadow-floating focus:outline-none`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id={headingId} className="font-display text-lg font-semibold">
                    {title ?? label}
                  </h2>
                  {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
                </div>
                <button
                  type="button"
                  aria-label="Close dialog"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1 text-muted transition-colors duration-150 hover:bg-primary-soft hover:text-ink"
                >
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-4">{children}</div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
