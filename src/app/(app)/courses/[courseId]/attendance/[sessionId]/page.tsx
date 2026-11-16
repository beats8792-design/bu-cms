import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { appGate } from "@/modules/auth/session";
import { getCourse } from "@/modules/academic/courses";
import { courseRoster } from "@/modules/academic/enrollment";
import {
  getSession,
  listSessionRecords,
  myAttendance,
} from "@/modules/attendance/service";
import { lowAttendanceMessage } from "@/modules/attendance/schema";
import { CloseReopenButton, RosterForm } from "@/modules/attendance/components/attendance-forms";

export const instant = false;

interface Props {
  params: Promise<{ courseId: string; sessionId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sessionId } = await params;
  return { title: `Attendance ${sessionId.slice(-6)}` };
}

export default async function AttendanceSessionPage({ params }: Props) {
  const { courseId, sessionId } = await params;
  const { user } = await appGate();
  const session = { user };

  let attSession;
  try {
    attSession = await getSession(session, sessionId);
  } catch {
    notFound();
  }
  if (attSession.courseId !== courseId) notFound();

  const course = await getCourse(session, courseId);
  const isManager = user.role === "admin" || (user.role === "teacher" && course.teacherIds.includes(user.id));
  const isStudentish = user.role === "student" || user.role === "cr";

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-muted">
        <Link href={`/courses/${courseId}`} className="hover:underline">
          {course.code} — {course.title}
        </Link>{" "}
        / attendance
      </p>
      <h1 className="font-display text-2xl font-semibold">Attendance — {attSession.date}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="num rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-hover">
          Section {attSession.section}
        </span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            attSession.status === "open" ? "bg-warn-soft text-warn" : "bg-primary-soft text-primary-hover"
          }`}
        >
          {attSession.status === "open" ? "Open — marking in progress" : "Closed"}
        </span>
        {attSession.topic ? <span className="text-muted">{attSession.topic}</span> : null}
        {isManager ? (
          <CloseReopenButton courseId={courseId} sessionId={sessionId} closed={attSession.status === "closed"} />
        ) : null}
      </div>

      {/* Teacher/admin: full editable roster (UCM-F15) */}
      {isManager ? (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">Mark roster</h2>
          <div className="mt-2">
            <MarkRoster courseId={courseId} sessionId={sessionId} section={attSession.section} sessionStatus={attSession.status} />
          </div>
        </section>
      ) : null}

      {/* Student/CR: own record + running percentage (UCM-F16/F17) */}
      {isStudentish && !isManager ? (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">Your attendance</h2>
          <MyRecord courseId={courseId} sessionId={sessionId} userId={user.id} />
        </section>
      ) : null}
    </div>
  );
}

/** Server component fetching the roster + records, then the client form. */
async function MarkRoster({
  courseId,
  sessionId,
  section,
  sessionStatus,
}: {
  courseId: string;
  sessionId: string;
  section: string;
  sessionStatus: "open" | "closed";
}) {
  const { user } = await appGate();
  const session = { user };
  const roster = await courseRoster(session, courseId);
  const records = await listSessionRecords(session, sessionId);
  const students = roster.filter((r) => r.section === section);

  if (students.length === 0) {
    return <p className="mt-2 text-sm text-muted">No students enrolled in section {section} yet.</p>;
  }

  return (
    <RosterForm
      courseId={courseId}
      sessionId={sessionId}
      sessionStatus={sessionStatus}
      students={students}
      records={records}
    />
  );
}

async function MyRecord({
  courseId,
  sessionId,
  userId,
}: {
  courseId: string;
  sessionId: string;
  userId: string;
}) {
  const { user } = await appGate();
  const session = { user };
  const att = await myAttendance(session, courseId, userId);
  const mine = att.records.find((r) => r.sessionId === sessionId);
  const warning = lowAttendanceMessage(att.stats.pct, att.threshold);

  return (
    <div>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {mine ? (
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              mine.status === "absent" ? "bg-danger-soft text-danger" : mine.status === "late" ? "bg-warn-soft text-warn" : "bg-primary-soft text-primary-hover"
            }`}
          >
            {mine.status.charAt(0).toUpperCase() + mine.status.slice(1)}
          </span>
        ) : (
          <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-hover">
            Not marked yet
          </span>
        )}
        <span className="num text-muted">
          {att.stats.pct === null
            ? "No sessions counted yet"
            : `${att.stats.attended}/${att.stats.possible} sessions · ${att.stats.pct}%`}
        </span>
      </p>
      {warning ? (
        <p role="alert" className="mt-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {warning}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-muted">Recent sessions:</p>
      <ul className="mt-1 flex flex-col gap-1 text-sm">
        {att.sessions.slice(0, 5).map((s) => {
          const rec = att.records.find((r) => r.sessionId === s.id);
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-2">
              <Link href={`/courses/${courseId}/attendance/${s.id}`} className="hover:underline">
                {s.date}
                {s.topic ? ` — ${s.topic}` : ""}
              </Link>
              <span className="text-xs text-muted">{rec ? rec.status : "not marked"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
