"use client";

import { useActionState } from "react";
import { gradeAction, submitAssignmentAction, type AssignmentFormState } from "@/modules/assignments/actions";
import { AssignmentFilePicker } from "@/modules/assignments/components/assignment-form";
import type { Submission } from "@/modules/assignments/schema";
import { Button, Notice, compactInputClass, inputClass } from "@/components/ui";

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
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">Submission saved.</Notice> : null}
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
          className={inputClass}
        />
      </label>

      <Button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className="self-start"
      >
        {pending ? "Submitting…" : existing ? "Resubmit" : "Submit"}
      </Button>
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
      {state.error ? <Notice tone="danger" className="w-full">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success" className="w-full">Graded.</Notice> : null}
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
          className={`num ml-1 w-20 ${compactInputClass}`}
        />
      </label>
      <label className="text-xs font-medium">
        <span className="sr-only">Feedback for {name}</span>
        Feedback
        <input
          name="feedback"
          defaultValue={feedback}
          placeholder="Optional feedback"
          className={`ml-1 w-48 ${compactInputClass}`}
        />
      </label>
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending ? "Saving…" : "Save grade"}
      </Button>
    </form>
  );
}
