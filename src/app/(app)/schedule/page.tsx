import type { Metadata } from "next";
import Link from "next/link";
import { appGate } from "@/modules/auth/session";
import { getCourse, listCourses } from "@/modules/academic/courses";
import { myCourseIds } from "@/modules/academic/enrollment";
import { buildWeekGrid, DAY_LABELS, WEEK_ORDER, type ScheduleSlot } from "@/modules/academic/schema";

export const metadata: Metadata = { title: "My Week" };

export const instant = false;

/** "My Week" timetable (UCM-F9): enrolled/taught courses → weekly grid. */
export default async function SchedulePage() {
  const { user } = await appGate();
  const session = { user };

  let courseIds: string[] = [];
  if (user.role === "teacher") {
    const taught = await listCourses(session, { mineOnly: true });
    courseIds = taught.map((c) => c.id);
  } else {
    courseIds = await myCourseIds(session);
  }

  const courses = await Promise.all(courseIds.map((id) => getCourse(session, id)));
  const slots: Array<ScheduleSlot & { label: string; courseId: string }> = courses.flatMap((c) =>
    c.schedule.map((s) => ({ ...s, label: `${c.code} · ${c.title}`, courseId: c.id })),
  );
  const grid = buildWeekGrid(slots);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-2xl font-semibold">My Week</h1>
      <p className="mt-1 text-sm text-muted">
        {user.role === "teacher" ? "Your teaching schedule across all courses." : "Classes from your enrolled courses."}
      </p>

      {slots.length === 0 ? (
        <p className="mt-8 text-sm text-muted">
          Nothing scheduled yet —{" "}
          {user.role === "teacher" ? (
            <Link href="/admin/courses" className="text-primary underline">
              add class slots to your courses
            </Link>
          ) : (
            <Link href="/courses" className="text-primary underline">
              enroll in courses with scheduled classes
            </Link>
          )}
          .
        </p>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {WEEK_ORDER.map((day) => {
            const daySlots = grid.get(day) ?? [];
            const isWeekend = day === 5 || day === 6; // Fri/Sat in BD
            return (
              <div
                key={day}
                className={`rounded-lg border border-border bg-surface p-4 ${isWeekend ? "opacity-70" : ""}`}
              >
                <p className="font-display text-sm font-semibold">{DAY_LABELS[day]}</p>
                {daySlots.length === 0 ? (
                  <p className="mt-2 text-xs text-muted">{isWeekend ? "Weekend" : "No classes"}</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-2">
                    {daySlots.map((s, i) => (
                      <li key={i}>
                        <Link href={`/courses/${s.courseId}`} className="block rounded-md bg-primary-soft p-2 text-xs hover:bg-primary hover:text-white">
                          <span className="num font-medium">
                            {s.start}–{s.end}
                          </span>
                          <span className="block">{s.label}</span>
                          {s.room ? <span className="block text-muted">{s.room}</span> : null}
                          <span className="block text-muted">sec {s.section}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-sm text-muted">
        Exam &amp; holiday calendar:{" "}
        <Link href="/calendar" className="text-primary underline">
          open the academic calendar
        </Link>
      </p>
    </div>
  );
}

