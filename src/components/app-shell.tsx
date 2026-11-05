"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/**
 * AppShell for signed-in areas (Phase 0 placeholder state).
 * Sidebar nav items are static until role gating lands in Phase 1;
 * paths/temporary nav labels live in NAV so they're easy to re-skin.
 */

export interface NavItem {
  href: string;
  label: string;
}

export const PLACEHOLDER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/courses", label: "Courses" },
  { href: "/schedule", label: "Schedule" },
  { href: "/announcements", label: "Announcements" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      {PLACEHOLDER_NAV.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setDrawerOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              active
                ? "bg-primary-soft text-primary-hover"
                : "text-muted hover:bg-primary-soft hover:text-primary-hover"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-dvh w-full flex-col bg-bg">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1.5 text-sm md:hidden"
            aria-expanded={drawerOpen}
            aria-controls="app-drawer"
            onClick={() => setDrawerOpen((v) => !v)}
          >
            Menu
          </button>
          <Link href="/" className="font-display text-base font-semibold text-primary">
            Jazbah UCMS
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span aria-hidden>🔔</span>
          <span className="rounded-full border border-border px-2.5 py-1 text-xs">
            Sign-in arrives in Phase 1
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-surface md:block">
          {nav}
        </aside>
        {drawerOpen && (
          <div id="app-drawer" className="absolute inset-x-0 top-14 z-10 bg-bg shadow-floating md:hidden">
            <div className="border-b border-border bg-surface">{nav}</div>
          </div>
        )}
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
