import Link from "next/link";

/**
 * Button primitives (DESIGN.md §5). Server-safe: pure className helpers plus
 * thin wrappers, so both server components and client forms can use them.
 *
 * Variants — primary (green), secondary (white/border), outline (green
 * border), ghost, danger (red), dangerLink (inline destructive text).
 * Sizes — sm 32px, md 40px.
 */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "dangerLink";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-hover disabled:hover:bg-primary",
  secondary:
    "border border-border bg-surface text-ink hover:bg-primary-soft disabled:hover:bg-surface",
  outline:
    "border border-primary bg-surface text-primary hover:bg-primary-soft disabled:hover:bg-surface",
  ghost: "text-primary hover:bg-primary-soft disabled:hover:bg-transparent",
  danger: "bg-danger text-white hover:opacity-90 disabled:hover:opacity-100",
  dangerLink: "text-danger underline hover:text-danger disabled:hover:text-danger",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
): string {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed";
  return `${base} ${VARIANT[variant]} ${SIZE[size]}`;
}

interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant, size, className, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={`${buttonClass(variant, size)}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}

interface ButtonLinkProps
  extends Omit<React.ComponentProps<typeof Link>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      className={`${buttonClass(variant, size)}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}
