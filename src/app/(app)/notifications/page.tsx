import type { Metadata } from "next";
import Link from "next/link";
import { appGate } from "@/modules/auth/session";
import { listMine } from "@/modules/notifications/service";
import type { NotificationType } from "@/modules/notifications/schema";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { MarkAllReadButton } from "@/modules/notifications/components/mark-all-read";

export const metadata: Metadata = { title: "Notifications" };

export const instant = false;

/** Text type label — status by text, never an icon alone (DESIGN §7). */
const TYPE_LABEL: Record<NotificationType, string> = {
  announcement: "Announcement",
  "assignment-deadline": "Deadline",
  "exam-schedule": "Exam schedule",
  "results-published": "Results",
  system: "System",
};

export default async function NotificationsPage() {
  const { user } = await appGate();
  const { items, unread } = await listMine({ user }, { limit: 50 });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Notifications" actions={unread > 0 ? <MarkAllReadButton /> : null}>
        {unread > 0 ? `${unread} unread` : "All caught up."}
      </PageHeader>

      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Nothing yet">
            Announcements, deadline reminders and published results will show up
            here as your courses progress.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={`rounded-lg border border-border bg-surface p-3 ${n.read ? "" : "border-l-4 border-l-primary"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {!n.read ? (
                  <Badge tone="info">Unread</Badge>
                ) : null}
                <Badge tone="neutral">{TYPE_LABEL[n.type]}</Badge>
                <Link href={n.link} className="text-sm font-medium hover:underline">
                  {n.title}
                </Link>
              </div>
              {n.body ? <p className="mt-1 text-sm text-muted">{n.body}</p> : null}
              <p className="num mt-1 text-xs text-muted">
                {n.createdAt.slice(0, 16).replace("T", " ")} (UTC)
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-sm text-muted">
        Looking for course-level updates? Check{" "}
        <Link href="/announcements" className="text-primary underline">
          announcements
        </Link>
        .
      </p>
    </div>
  );
}
