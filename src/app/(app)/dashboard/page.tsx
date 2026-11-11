import type { Metadata } from "next";
import Link from "next/link";
import { appGate } from "@/modules/auth/session";
import { myCourseIds } from "@/modules/academic/enrollment";
import { listDueAssignments } from "@/modules/assignments/service";
import { deadlineState, formatDeadline, type Assignment } from "@/modules/assignments/schema";

export const metadata: Metadata = { title: "Dashboard" };

export const instant = false;

/** "Due soon" list (UCM-F13) for students/CRs across their courses. */
async function DueSoon({ userId, role }: { userId: string; role: string }) {
  if (role !== "student" && role !== "cr") return null;
  const courseIds = await myCourseIds({ user: { id: userId, role } });
  const due = await listDueAssignments({ user: { id: userId, role } }, courseIds);

  if (due.length === 0) {
    return (
      <div className="mt-6">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">Due soon</h2>
        <p className="mt-2 text-sm text-muted">Nothing due — you are all caught up.</p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">Due soon</h2>
      <ul className="mt-2 grid gap-3">
        {due.map((a) => (
          <DueRow key={a.id} assignment={a} />
        ))}
      </ul>
    </div>
  );
}

function DueRow({ assignment }: { assignment: Assignment }) {
  const ds = deadlineState(assignment.deadline);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-4">
      <div>
        <Link href={`/courses/${assignment.courseId}/assignments/${assignment.id}`} className="text-sm font-medium hover:underline">
          {assignment.title}
        </Link>
        <p className="num text-xs text-muted">{formatDeadline(assignment.deadline)}</p>
      </div>
      <span
        className={`num rounded-full px-3 py-1 text-xs font-medium ${
          ds === "due-soon" ? "bg-warn-soft text-warn" : "bg-primary-soft text-primary-hover"
        }`}
      >
        {assignment.points} pts
      </span>
    </li>
  );
}

export default async function DashboardPage() {
  const { user } = await appGate();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-semibold">
        Welcome, {user.displayName || user.name}
      </h1>
      <p className="mt-2 text-muted">
        Signed in as <strong>{user.role}</strong> ({user.email}
        {user.studentId ? ` · ID ${user.studentId}` : ""}) — approved and active.
      </p>

      <DueSoon userId={user.id} role={user.role} />
    </div>
  );
}
