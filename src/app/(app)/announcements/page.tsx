import type { Metadata } from "next";
import { appGate } from "@/modules/auth/session";
import { listDepartments } from "@/modules/academic/departments";
import { listAnnouncements, composableCourses } from "@/modules/announcements/service";
import { scopeLabel } from "@/modules/announcements/schema";
import {
  AnnouncementComposer,
  AnnouncementEditForm,
  DeleteAnnouncementButton,
  PinButton,
} from "@/modules/announcements/components/announcement-forms";

export const metadata: Metadata = { title: "Announcements · UCMS" };

export const instant = false;

const SCOPES_BY_ROLE: Record<string, Array<{ value: "university" | "department" | "course" | "section"; label: string }>> = {
  admin: [
    { value: "university", label: "University" },
    { value: "department", label: "Department" },
    { value: "course", label: "Course" },
    { value: "section", label: "Section" },
  ],
  teacher: [
    { value: "course", label: "Course" },
    { value: "section", label: "Section" },
  ],
  cr: [
    { value: "course", label: "My class (course)" },
    { value: "section", label: "My section" },
  ],
};

export default async function AnnouncementsPage() {
  const { user } = await appGate();
  const session = { user };

  const [items, canCompose] = (await Promise.all([
    listAnnouncements(session),
    SCOPES_BY_ROLE[user.role] ? composableCourses(session) : Promise.resolve(null),
  ])) as [
    Awaited<ReturnType<typeof listAnnouncements>>,
    Awaited<ReturnType<typeof composableCourses>> | null,
  ];
  const departments = user.role === "admin" ? await listDepartments(session) : [];
  const scopes = SCOPES_BY_ROLE[user.role] ?? [];
  const canSeeComposer = scopes.length > 0 && canCompose !== null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-semibold">Announcements</h1>

      {canSeeComposer && canCompose ? (
        <div className="mt-4">
          <AnnouncementComposer scopes={scopes} courses={canCompose} departments={departments.map((d) => ({ id: d.id, code: d.code, name: d.name }))} />
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          No announcements yet — university, department, course and section posts will appear here.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {items.map((a) => {
            const canManage = user.role === "admin" || a.authorId === user.id;
            return (
              <li key={a.id} className={`rounded-lg border border-border bg-surface p-4 ${a.pinned ? "border-l-4 border-l-primary" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  {a.pinned ? <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-hover">pinned</span> : null}
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-hover">
                    {scopeLabel(a)}
                  </span>
                  <h2 className="font-display text-base font-semibold">{a.title}</h2>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm">{a.body}</p>
                <p className="num mt-2 text-xs text-muted">
                  {a.authorName} · {a.createdAt.slice(0, 16).replace("T", " ")}
                  {a.updatedAt > a.createdAt ? ` · edited ${a.updatedAt.slice(0, 16).replace("T", " ")}` : ""}
                </p>
                {canManage ? (
                  <p className="mt-2 flex gap-3">
                    <PinButton id={a.id} pinned={a.pinned} />
                    <AnnouncementEditForm announcement={a} />
                    <DeleteAnnouncementButton id={a.id} />
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
