"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/** Stroke bell icon (no emoji UI). Decorative — the link carries the label. */
function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

/**
 * Bell in the AppShell header (Phase 7). Polls /api/notifications every 60s
 * while the tab is visible; a click lands on /notifications for the full
 * list + mark-read controls.
 */
export function NotificationBell() {
  const [unread, setUnread] = useState(0);

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unread?: number };
      setUnread(data.unread ?? 0);
    } catch {
      // Network hiccups are fine — the next tick retries.
    }
  }, []);

  useEffect(() => {
    // Initial load deferred to a timer so the effect body stays setState-free.
    const kickoff = setTimeout(poll, 0);
    const timer = setInterval(poll, 60_000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [poll]);

  return (
    <Link
      href="/notifications"
      aria-label={`Notifications${unread > 0 ? ` — ${unread} unread` : ""}`}
      className="relative inline-flex h-8 items-center rounded-md border border-border px-2.5 text-sm text-ink transition-colors duration-150 hover:bg-primary-soft"
    >
      <BellIcon />
      {unread > 0 ? (
        <span className="num absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-danger px-1 text-center text-xs font-semibold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
