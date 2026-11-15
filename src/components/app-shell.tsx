"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/modules/auth/auth-client";
import { NotificationBell } from "@/modules/notifications/components/notification-bell";
import { NAV_BY_ROLE } from "@/components/nav";
import type { Role } from "@/modules/auth/rbac";

export interface AppShellProps {
  children: React.ReactNode;
  role: Role;
  name: string;
  email: string;
}

/**
 * AppShell for signed-in areas (Brain/DESIGN.md §6). Nav comes from the
 * role map; the admin chip appears only for admins.
 */
export function AppShell({ children, role, name, email }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  const items = NAV_BY_ROLE[role] ?? NAV_BY_ROLE.student;

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      {items.map((item) => {
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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-card"
      >
        Skip to content
      </a>
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
          <Link href="/dashboard" className="font-display text-base font-semibold text-primary">
            Jazbah UCMS
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span
            className="hidden rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary-hover sm:inline"
          >
            {role}
          </span>
          <span className="hidden text-sm text-muted md:inline" title={email}>
            {name}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-primary-soft"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex w-full flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-surface md:sticky md:top-14 md:block md:h-[calc(100dvh-3.5rem)] md:self-start md:overflow-y-auto">
          {nav}
        </aside>
        {drawerOpen && (
          <div id="app-drawer" className="absolute inset-x-0 top-14 z-10 bg-bg shadow-floating md:hidden">
            <div className="border-b border-border bg-surface">{nav}</div>
          </div>
        )}
        <main id="main-content" className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
