import type { Metadata } from "next";
import { appGate } from "@/modules/auth/session";
import { listEvents } from "@/modules/academic/calendar";
import { listDepartments } from "@/modules/academic/departments";
import { listCourses } from "@/modules/academic/courses";
import { EventForm } from "@/modules/academic/components/course-form";
import { Badge, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Academic calendar" };

export const instant = false;

const TYPE_LABEL = { exam: "Exam", holiday: "Holiday", notice: "Notice" } as const;

export default async function CalendarPage() {
  const { user } = await appGate();
  const session = { user };
  const canPost = user.role === "admin" || user.role === "teacher";

  const [events, departments, courses] = await Promise.all([
    listEvents(session),
    canPost && user.role === "admin"
      ? listDepartments(session)
      : Promise.resolve([]),
    canPost
      ? listCourses(session, user.role === "teacher" ? { mineOnly: true } : {})
      : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-2xl font-semibold">Academic calendar</h1>
      <p className="mt-1 text-sm text-muted">Exams, holidays and notices across the university.</p>

      {canPost ? (
        <div className="mt-6">
          <h2 className="font-display text-xl font-semibold">Post an event</h2>
          <div className="mt-3">
            <EventForm
              departments={departments}
              courses={courses}
              isAdmin={user.role === "admin"}
            />
          </div>
        </div>
      ) : null}

      {events.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="No events posted yet">
            Exams, holidays and notices will appear here once posted.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <Badge tone={e.type === "holiday" ? "neutral" : "warn"}>
                  {TYPE_LABEL[e.type]}
                </Badge>
                <span className="num text-sm font-medium">{e.date}</span>
                <span className="text-xs text-muted">
                  {e.scope.type === "university" ? "University" : e.scope.type === "dept" ? "Department" : "Course"}
                </span>
              </div>
              <p className="mt-1 font-medium">{e.title}</p>
              {e.description ? <p className="mt-1 text-sm text-muted">{e.description}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
