"use client";

import { useActionState } from "react";
import { gradeAction, submitAssignmentAction, type AssignmentFormState } from "@/modules/assignments/actions";
import { AssignmentFilePicker } from "@/modules/assignments/components/assignment-form";
import type { Submission } from "@/modules/assignments/schema";

/** Student submit/resubmit box (UCM-F11): files + note, versioned. */
export function SubmissionForm({
  courseId,
  assignmentId,
  existing,
}: {
  courseId: string;
  assignmentId: string;
  existing?: Submission | null;
}) {
  const [state, formAction, pending] = useActionState(submitAssignmentAction, {} as AssignmentFormState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-hover">
          Submission saved.
        </p>
      ) : null}
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="courseId" value={courseId} />

      <AssignmentFilePicker
        kind="submission"
        courseId={courseId}
        assignmentId={assignmentId}
        label={existing ? "Replace files (resubmit — the old version is kept)" : "Submission files"}
      />

      <label className="text-sm font-medium">
        Note for the teacher <span className="text-muted">(optional)</span>
        <textarea
          name="note"
          rows={2}
          defaultValue={existing?.note ?? ""}
          className="mt-1 w-full rounded-md border border-border px-3 py-2"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Submitting…" : existing ? "Resubmit" : "Submit"}
      </button>
    </form>
  );
}

/** Teacher grade box per student row (UCM-F12). */
export function GradeForm({
  assignmentId,
  courseId,
  userId,
  name,
  points,
  score,
  feedback,
}: {
  assignmentId: string;
  courseId: string;
  userId: string;
  name: string;
  points: number;
  score: number | null;
  feedback: string;
}) {
  const [state, formAction, pending] = useActionState(gradeAction, {} as AssignmentFormState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      {state.error ? (
        <p role="alert" className="w-full rounded-md bg-danger-soft px-2 py-1 text-xs text-danger">{state.error}</p>
      ) : null}
      {state.ok ? <p className="w-full text-xs text-primary-hover">Graded.</p> : null}
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="userId" value={userId} />
      <label className="text-xs font-medium">
        <span className="sr-only">Score for {name}</span>
        Score /{points}
        <input
          name="score"
          type="number"
          min="0"
          max={points}
          step="0.5"
          defaultValue={score ?? ""}
          className="num ml-1 w-20 rounded-md border border-border px-2 py-1"
        />
      </label>
      <label className="text-xs font-medium">
        <span className="sr-only">Feedback for {name}</span>
        Feedback
        <input
          name="feedback"
          defaultValue={feedback}
          placeholder="Optional feedback"
          className="ml-1 w-48 rounded-md border border-border px-2 py-1"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-primary px-3 py-1 text-xs font-medium text-primary hover:bg-primary-soft disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save grade"}
      </button>
    </form>
  );
}
