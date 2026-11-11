"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

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
      className="relative rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-primary-soft"
    >
      🔔
      {unread > 0 ? (
        <span className="num absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-danger px-1 text-center text-xs font-semibold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
