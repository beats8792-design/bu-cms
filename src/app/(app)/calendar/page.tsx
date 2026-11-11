import type { Metadata } from "next";
import { appGate } from "@/modules/auth/session";
import { listEvents } from "@/modules/academic/calendar";
import { listDepartments } from "@/modules/academic/departments";
import { listCourses } from "@/modules/academic/courses";
import { EventForm } from "@/modules/academic/components/course-form";

export const metadata: Metadata = { title: "Academic calendar" };

export const instant = false;

const TYPE_LABEL = { exam: "Exam", holiday: "Holiday", notice: "Notice" } as const;

export default async function CalendarPage() {
  const { user } = await appGate();
  const session = { user };
  const events = await listEvents(session);
  const canPost = user.role === "admin" || user.role === "teacher";

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-semibold">Academic calendar</h1>
      <p className="mt-1 text-sm text-muted">Exams, holidays and notices across the university.</p>

      {canPost ? (
        <div className="mt-6">
          <h2 className="font-display text-lg font-semibold">Post an event</h2>
          <div className="mt-3">
            <EventForm
              departments={user.role === "admin" ? await listDepartments(session) : []}
              courses={await listCourses(session, user.role === "teacher" ? { mineOnly: true } : {})}
              isAdmin={user.role === "admin"}
            />
          </div>
        </div>
      ) : null}

      {events.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No events posted yet.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    e.type === "exam"
                      ? "bg-danger-soft text-danger"
                      : e.type === "holiday"
                        ? "bg-primary-soft text-primary-hover"
                        : "bg-warn-soft text-warn"
                  }`}
                >
                  {TYPE_LABEL[e.type]}
                </span>
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
