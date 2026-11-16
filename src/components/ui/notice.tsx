/**
 * Notice (DESIGN.md §5 + §7): inline feedback banners. Errors use
 * role="alert", success/info use role="status" so screen readers announce
 * them (DESIGN §7: status conveyed by text, never color alone).
 */

export type NoticeTone = "danger" | "success" | "warn" | "info";

const TONE: Record<NoticeTone, string> = {
  danger: "bg-danger-soft text-danger",
  success: "bg-primary-soft text-primary-hover",
  warn: "bg-warn-soft text-warn",
  info: "bg-primary-soft text-primary-hover",
};

export function noticeClass(tone: NoticeTone): string {
  return `rounded-md px-3 py-2 text-sm ${TONE[tone]}`;
}

interface NoticeProps {
  tone?: NoticeTone;
  children: React.ReactNode;
  className?: string;
}

export function Notice({ tone = "info", children, className }: NoticeProps) {
  const isError = tone === "danger";
  const isWarn = tone === "warn";
  return (
    <p
      role={isError ? "alert" : isWarn ? undefined : "status"}
      className={`${noticeClass(tone)}${className ? ` ${className}` : ""}`}
    >
      {children}
    </p>
  );
}
