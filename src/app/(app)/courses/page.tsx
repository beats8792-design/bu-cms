import type { Metadata } from "next";
import Link from "next/link";
import { appGate } from "@/modules/auth/session";
import { listCourses, countEnrolled, teacherNamesByIds } from "@/modules/academic/courses";
import { getOpenSemester, listSemesters } from "@/modules/academic/semesters";
import { myCourseIds } from "@/modules/academic/enrollment";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Courses" };

export const instant = false;

export default async function CoursesPage() {
  const { user } = await appGate();
  const openSemester = await getOpenSemester({ user });
  const semesters = await listSemesters({ user });
  const current = openSemester ?? semesters[0] ?? null;

  const courses = current
    ? await listCourses({ user }, { semesterId: current.id })
    : [];
  const seats = await countEnrolled(courses.map((c) => c.id));
  const teacherNames = await teacherNamesByIds([...new Set(courses.flatMap((c) => c.teacherIds))]);
  const mine = new Set(user.role === "student" || user.role === "cr" ? await myCourseIds({ user }) : []);
  const canSelfEnroll = (user.role === "student" || user.role === "cr") && Boolean(openSemester);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-2xl font-semibold">Courses</h1>
      <p className="mt-1 text-sm text-muted">
        {current
          ? `${current.term} ${current.academicYear}${
              openSemester ? " — enrollment open" : " — enrollment closed"
            }`
          : "No semesters exist yet — ask the admin office."}
      </p>
      {user.role === "teacher" ? (
        <>
          <p className="mt-1 text-sm text-muted">
            You teach the starred (*) courses below.
          </p>
          <div className="mt-4 rounded-lg border border-border bg-surface p-4 text-sm">
            Teacher tools: open one of your courses below and add its class slots
            (weekly schedule) from the course page.
          </div>
        </>
      ) : null}

      {courses.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="No courses yet">
            {current
              ? "No courses published for this semester yet — check back after the admin publishes them."
              : "Nothing to browse yet — no semesters exist yet."}
          </EmptyState>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {courses.map((c) => {
            const enrolled = seats.get(c.id) ?? 0;
            const mineStar = c.teacherIds.includes(user.id) ? "* " : "";
            return (
              <Link
                key={c.id}
                href={`/courses/${c.id}`}
                className="rounded-lg border border-border bg-surface p-4 transition-colors duration-150 hover:bg-primary-soft"
              >
                <p className="font-mono text-xs text-muted">
                  {mineStar}
                  {c.code} · {c.type} · {c.credits} credits
                </p>
                <p className="mt-1 font-medium">{c.title}</p>
                <p className="mt-2 num text-sm text-muted">
                  {enrolled}/{c.seatLimit} seats
                  {c.teacherIds.length > 0
                    ? ` · ${c.teacherIds.map((t) => teacherNames.get(t) ?? "?").join(", ")}`
                    : ""}
                </p>
                {canSelfEnroll && mine.has(c.id) ? (
                  <p className="mt-2 text-xs text-primary-hover">Enrolled</p>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
