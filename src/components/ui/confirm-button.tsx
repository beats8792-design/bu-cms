"use client";

import { Button, type ButtonSize, type ButtonVariant } from "./button";

/**
 * Destructive-action button (DESIGN.md §1: place of record — irreversible
 * actions ask first). Uses the native confirm dialog (keyboard/screen-reader
 * friendly). Callers own the pending state from their useTransition/action
 * flow and pass it in; the button blocks double submits while pending.
 */
export function ConfirmButton({
  confirm,
  onConfirm,
  pending,
  busyLabel,
  variant = "danger",
  size = "sm",
  children,
  className,
  ...rest
}: Omit<React.ComponentProps<typeof Button>, "onClick" | "variant"> & {
  confirm: string;
  onConfirm: () => void;
  pending?: boolean;
  busyLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      aria-busy={pending || undefined}
      disabled={rest.disabled || pending}
      onClick={() => {
        if (window.confirm(confirm)) onConfirm();
      }}
      {...rest}
    >
      {pending && busyLabel ? busyLabel : children}
    </Button>
  );
}
