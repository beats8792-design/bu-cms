import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { appGate } from "@/modules/auth/session";
import { myCourseIds } from "@/modules/academic/enrollment";
import { getCourse } from "@/modules/academic/courses";
import { listEvents } from "@/modules/academic/calendar";
import { listDueAssignments } from "@/modules/assignments/service";
import { formatDeadline } from "@/modules/assignments/schema";
import { courseDigest } from "@/modules/attendance/service";
import { listAnnouncements } from "@/modules/announcements/service";
import { scopeLabel, type Announcement } from "@/modules/announcements/schema";
import { dhakaToday } from "@/modules/attendance/schema";
import type { SessionUser } from "@/modules/auth/session";
import { Badge } from "@/components/ui";

/**
 * CR dashboard (UCM-R1): own class overview — upcoming deadlines, exam
 * schedule, low-attendance roster summary, recent announcements + composer
 * (UCM-R2 lives on /announcements; linked here).
 */
export const metadata: Metadata = { title: "CR dashboard · UCMS" };

export const instant = false;

export default async function CrDashboardPage() {
  const { user } = await appGate();
  if (user.role !== "cr") redirect("/dashboard");
  const session = { user };

  const courseIds = await myCourseIds(session);
  const courses = (await Promise.all(courseIds.map((id) => getCourse(session, id)))) as Awaited<
    ReturnType<typeof getCourse>
  >[];
  const announcements = await listAnnouncements(session, { limit: 10 });

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-2xl font-semibold">CR dashboard</h1>
      <p className="mt-1 text-sm text-muted">
        Your classes at a glance. Post announcements from{" "}
        <Link href="/announcements" className="text-primary underline">
          Announcements
        </Link>
        .
      </p>

      {courses.length === 0 ? (
        <p className="mt-6 text-sm text-muted">You are not enrolled in any course yet.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-8">
          {courses.map((c) => (
            <CourseOverview
              key={c.id}
              user={user}
              courseId={c.id}
              code={c.code}
              title={c.title}
              announcements={announcements}
            />
          ))}
        </div>
      )}
    </div>
  );
}

async function CourseOverview({
  user,
  courseId,
  code,
  title,
  announcements,
}: {
  user: SessionUser;
  courseId: string;
  code: string;
  title: string;
  announcements: Announcement[];
}) {
  const session = { user };

  const [due, events, digest] = (await Promise.all([
    listDueAssignments(session, [courseId], { limit: 3 }),
    listEvents(session, { scopeType: "course", refId: courseId }),
    courseDigest(session, courseId),
  ])) as [
    Awaited<ReturnType<typeof listDueAssignments>>,
    Awaited<ReturnType<typeof listEvents>>,
    Awaited<ReturnType<typeof courseDigest>>,
  ];

  const exams = events.filter((e) => e.type === "exam" && e.date >= dhakaToday()).slice(0, 3);
  const warnings = digest.rows.filter((r) => r.warning);
  const recent = announcements.filter((a) => a.refId === courseId).slice(0, 3);

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="font-display text-xl font-semibold">
        <Link href={`/courses/${courseId}`} className="hover:underline">
          {code} — {title}
        </Link>
      </h2>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-muted">Upcoming deadlines</h3>
          {due.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Nothing due.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {due.map((a) => (
                <li key={a.id}>
                  <Link href={`/courses/${courseId}/assignments/${a.id}`} className="hover:underline">
                    {a.title}
                  </Link>{" "}
                  <span className="num text-xs text-muted">due {formatDeadline(a.deadline)}</span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-4 text-sm font-semibold text-muted">Exams</h3>
          {exams.length === 0 ? (
            <p className="mt-1 text-sm text-muted">No exams scheduled.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {exams.map((e) => (
                <li key={e.id} className="num text-sm">
                  {e.date} — {e.title}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-muted">Low attendance ({digest.threshold}%)</h3>
          {warnings.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Nobody below the threshold.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {warnings.slice(0, 5).map((r) => (
                <li key={r.userId} className="flex flex-wrap items-baseline gap-2">
                  <span>{r.name}</span>
                  <Badge tone="warn" className="num">
                    {r.stats.pct === null ? "no data" : `${r.stats.pct}%`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-muted">
            Full roster on the{" "}
            <Link href={`/courses/${courseId}`} className="underline">
              course page
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-muted">Recent announcements</h3>
        {recent.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Nothing posted yet.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {recent.map((a) => (
              <li key={a.id}>
                <Link href="/announcements" className="hover:underline">
                  {a.title}
                </Link>{" "}
                <span className="text-xs text-muted">{scopeLabel(a)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
