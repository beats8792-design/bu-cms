/**
 * Badge (DESIGN.md §5): soft background + darker text of one semantic color.
 * Tones — info (green, "the university"), warn (amber, attention due),
 * danger (red), neutral (muted). Never decorative: a badge states a status.
 */

export type BadgeTone = "info" | "warn" | "danger" | "neutral";

const TONE: Record<BadgeTone, string> = {
  info: "bg-primary-soft text-primary-hover",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-bg text-muted",
};

export function badgeClass(tone: BadgeTone = "info"): string {
  return `inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`;
}

interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ tone, children, className }: BadgeProps) {
  return (
    <span className={`${badgeClass(tone)}${className ? ` ${className}` : ""}`}>
      {children}
    </span>
  );
}
