import type { Metadata } from "next";
import Link from "next/link";
import { appGate } from "@/modules/auth/session";
import { listMine } from "@/modules/notifications/service";
import { NOTIFICATION_ICON } from "@/modules/notifications/schema";

export const metadata: Metadata = { title: "Notifications · UCMS" };

export const instant = false;

export default async function NotificationsPage() {
  const { user } = await appGate();
  const { items, unread } = await listMine({ user }, { limit: 50 });

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-2xl font-semibold">Notifications</h1>
      <p className="mt-1 text-sm text-muted">
        {unread > 0 ? `${unread} unread` : "All caught up."}
      </p>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          Nothing yet — announcements, deadline reminders and results will show up here.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={`rounded-lg border border-border bg-surface p-3 ${n.read ? "" : "border-l-4 border-l-primary"}`}
            >
              <Link href={n.link} className="flex gap-2 text-sm hover:underline">
                <span aria-hidden>{NOTIFICATION_ICON[n.type] ?? "🔔"}</span>
                <span>
                  <span className="font-medium">{n.title}</span>
                  {n.body ? <span className="text-muted"> — {n.body}</span> : null}
                </span>
              </Link>
              <p className="num mt-1 text-xs text-muted">
                {n.createdAt.slice(0, 16).replace("T", " ")} · {n.type}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
