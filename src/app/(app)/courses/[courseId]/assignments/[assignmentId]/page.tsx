import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { appGate } from "@/modules/auth/session";
import { getCourse } from "@/modules/academic/courses";
import {
  getAssignment,
  mySubmission,
  teacherDashboard,
} from "@/modules/assignments/service";
import {
  deadlineState,
  formatDeadline,
  type Assignment,
} from "@/modules/assignments/schema";
import { formatBytes } from "@/modules/materials/schema";
import { AssignmentForm, DeleteAssignmentButton } from "@/modules/assignments/components/assignment-form";
import { GradeForm, SubmissionForm } from "@/modules/assignments/components/submission-forms";

export const instant = false;

interface Props {
  params: Promise<{ courseId: string; assignmentId: string }>;
}

const STATUS_LABEL = {
  pending: { text: "Not submitted", cls: "bg-warn-soft text-warn" },
  submitted: { text: "Submitted", cls: "bg-primary-soft text-primary-hover" },
  late: { text: "Late", cls: "bg-danger-soft text-danger" },
  graded: { text: "Graded", cls: "bg-primary-soft text-primary-hover" },
} as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { assignmentId } = await params;
  return { title: `Assignment ${assignmentId.slice(-6)}` };
}

export default async function AssignmentPage({ params }: Props) {
  const { courseId, assignmentId } = await params;
  const { user } = await appGate();
  const session = { user };

  let assignment: Assignment;
  try {
    assignment = await getAssignment(session, assignmentId);
  } catch {
    notFound();
  }
  if (assignment.courseId !== courseId) notFound();

  const course = await getCourse(session, courseId);
  const isAdmin = user.role === "admin";
  const isTeacherOfCourse = user.role === "teacher" && course.teacherIds.includes(user.id);
  const canManage = isAdmin || isTeacherOfCourse;
  const isStudentish = user.role === "student" || user.role === "cr";

  const myRow = isStudentish ? await mySubmission(session, assignmentId) : null;
  const dash = canManage ? await teacherDashboard(session, assignmentId) : null;

  const state = deadlineState(assignment.deadline);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-muted">
        <Link href={`/courses/${courseId}`} className="hover:underline">
          {course.code} — {course.title}
        </Link>{" "}
        / assignment
      </p>
      <h1 className="font-display text-2xl font-semibold">{assignment.title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="num rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-hover">
          {assignment.points} points
        </span>
        <span
          className={`num rounded-full px-3 py-1 text-xs font-medium ${
            state === "closed" ? "bg-danger-soft text-danger" : state === "due-soon" ? "bg-warn-soft text-warn" : "bg-primary-soft text-primary-hover"
          }`}
        >
          Due {formatDeadline(assignment.deadline)}
        </span>
        <span className="text-xs text-muted">
          {assignment.latePolicy === "allow" ? "Late submissions allowed (auto-flagged)" : "Late submissions blocked"}
        </span>
      </div>

      {assignment.description ? (
        <p className="mt-4 whitespace-pre-line text-sm">{assignment.description}</p>
      ) : null}

      {assignment.attachments.length > 0 ? (
        <div className="mt-4 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium">Attachments</p>
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {assignment.attachments.map((a, i) => (
              <li key={i} className="flex items-center gap-2">
                <a href={`/api/assignments/${assignmentId}/attachment?p=${encodeURIComponent(a.publicId)}`} className="text-primary underline">
                  {a.fileName}
                </a>
                <span className="num text-xs text-muted">{formatBytes(a.size)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Student view: submit / status */}
      {isStudentish ? (
        <div className="mt-8">
          <h2 className="font-display text-xl font-semibold">Your submission</h2>
          {myRow ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_LABEL[myRow.score !== null ? "graded" : myRow.isLate ? "late" : "submitted"].cls}`}>
                {STATUS_LABEL[myRow.score !== null ? "graded" : myRow.isLate ? "late" : "submitted"].text}
              </span>
              <span className="num text-xs text-muted">submitted {myRow.submittedAt.slice(0, 16).replace("T", " ")}</span>
              {myRow.versionHistory.length > 0 ? (
                <span className="num text-xs text-muted">{myRow.versionHistory.length} earlier version{myRow.versionHistory.length === 1 ? "" : "s"}</span>
              ) : null}
            </div>
          ) : null}
          {myRow?.score !== null && myRow ? (
            <p className="mt-2 text-sm">
              <strong className="num">{myRow.score}</strong> / {assignment.points} points
              {myRow.feedback ? ` — ${myRow.feedback}` : ""}
            </p>
          ) : null}
          {myRow && myRow.files.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {myRow.files.map((f, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span>{f.fileName}</span>
                  <span className="num text-xs text-muted">{formatBytes(f.size)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-4">
            <SubmissionForm courseId={courseId} assignmentId={assignmentId} existing={myRow} />
          </div>
        </div>
      ) : null}

      {/* Teacher view: grading dashboard */}
      {dash ? (
        <div className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-semibold">
              Grading dashboard ({dash.rows.length} students)
            </h2>
            <a
              href={`/api/assignments/${assignmentId}/download-all`}
              className="rounded-md border border-primary px-3 py-2 text-sm font-medium text-primary hover:bg-primary-soft"
            >
              Download all submissions (zip)
            </a>
          </div>
          {dash.rows.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No students enrolled yet.</p>
          ) : (
            <table className="mt-4 w-full border-collapse text-sm">
              <caption className="sr-only">Submission status per student</caption>
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-3 font-medium">Student</th>
                  <th className="py-2 pr-3 font-medium">Sec</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Grade</th>
                </tr>
              </thead>
              <tbody>
                {dash.rows.map((r) => (
                  <tr key={r.userId} className="border-b border-border align-top hover:bg-primary-soft">
                    <td className="py-2 pr-3">
                      {r.name}
                      {r.studentId ? <span className="num ml-2 text-xs text-muted">{r.studentId}</span> : null}
                    </td>
                    <td className="py-2 pr-3">{r.section}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_LABEL[r.status].cls}`}>
                        {STATUS_LABEL[r.status].text}
                      </span>
                      {r.status === "graded" && r.score !== null ? (
                        <span className="num ml-2 text-xs">{r.score}/{assignment.points}</span>
                      ) : null}
                    </td>
                    <td className="py-2">
                      <GradeForm
                        assignmentId={assignmentId}
                        courseId={courseId}
                        userId={r.userId}
                        name={r.name}
                        points={assignment.points}
                        score={r.score}
                        feedback={dash.submissions.find((s) => s.userId === r.userId)?.feedback ?? ""}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {/* Manage: edit + delete */}
      {canManage ? (
        <section className="mt-10 flex flex-col gap-4">
          <h2 className="font-display text-xl font-semibold">Manage assignment</h2>
          <AssignmentForm courseId={courseId} assignment={assignment} />
          <div>
            <DeleteAssignmentButton assignmentId={assignmentId} courseId={courseId} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
