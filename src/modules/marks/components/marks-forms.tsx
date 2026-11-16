"use client";

import { useActionState, useRef, useState } from "react";
import { saveRowAction, saveSchemaAction, setPublishedAction, type MarksFormState } from "@/modules/marks/actions";
import type { AssessmentComponent, MarksGridRow } from "@/modules/marks/schema";
import { Button, ConfirmButton, Notice, compactInputClass } from "@/components/ui";

/** UCM-F18: editable assessment plan with a live weight-sum meter. */
export function SchemaEditor({
  courseId,
  components,
  lockedKeys,
}: {
  courseId: string;
  components: AssessmentComponent[];
  lockedKeys: string[];
}) {
  const [state, formAction, pending] = useActionState(saveSchemaAction, {} as MarksFormState);
  const [rows, setRows] = useState<AssessmentComponent[]>(
    components.length > 0
      ? components
      : [
          { key: "ct", name: "Class Test", maxMarks: 20, weight: 20 },
          { key: "mid", name: "Midterm", maxMarks: 30, weight: 30 },
          { key: "assignment", name: "Assignment", maxMarks: 10, weight: 10 },
          { key: "final", name: "Final Exam", maxMarks: 40, weight: 40 },
        ],
  );
  const weightSum = rows.reduce((a, r) => a + (Number.isFinite(r.weight) ? r.weight : 0), 0);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">Assessment plan saved.</Notice> : null}
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="count" value={rows.length} />

      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Assessment components</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th className="py-1 pr-2 font-medium">Key</th>
            <th className="py-1 pr-2 font-medium">Name</th>
            <th className="py-1 pr-2 font-medium">Max</th>
            <th className="py-1 pr-2 font-medium">Weight %</th>
            <th className="py-1 font-medium sr-only">Remove</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={i}>
              <td className="py-1 pr-2">
                <input
                  name={`key-${i}`}
                  required
                  defaultValue={c.key}
                  readOnly={lockedKeys.includes(c.key)}
                  title={lockedKeys.includes(c.key) ? "Marks exist for this key — it cannot be renamed" : ""}
                  aria-label="Component key"
                  className={`num w-24 read-only:bg-primary-soft ${compactInputClass}`}
                />
              </td>
              <td className="py-1 pr-2">
                <input name={`name-${i}`} required defaultValue={c.name} className={`w-40 ${compactInputClass}`} />
              </td>
              <td className="py-1 pr-2">
                <input name={`max-${i}`} type="number" min="1" max="1000" required defaultValue={c.maxMarks} className={`num w-20 ${compactInputClass}`} />
              </td>
              <td className="py-1 pr-2">
                <input name={`weight-${i}`} type="number" min="1" max="100" required defaultValue={c.weight} className={`num w-16 ${compactInputClass}`} />
              </td>
              <td className="py-1">
                <button
                  type="button"
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  disabled={rows.length === 1 || lockedKeys.includes(c.key)}
                  className="text-xs text-danger underline disabled:opacity-40"
                >
                  remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() =>
            setRows([...rows, { key: `comp${rows.length + 1}`, name: "New component", maxMarks: 10, weight: 10 }])
          }
          disabled={rows.length >= 12}
          className="rounded-md border border-border px-3 py-1 text-sm hover:bg-primary-soft disabled:opacity-60"
        >
          + Add component
        </button>
        <span className={`num text-sm font-medium ${weightSum === 100 ? "text-primary-hover" : "text-danger"}`}>
          Weights: {weightSum}/100 {weightSum === 100 ? "" : "— must be exactly 100"}
        </span>
        <Button
          type="submit"
          disabled={pending || weightSum !== 100}
          aria-busy={pending || undefined}
        >
          {pending ? "Saving…" : "Save plan"}
        </Button>
      </div>
    </form>
  );
}

/** UCM-F19/F23: one row of the spreadsheet grid (per student). */
export function GridRow({
  courseId,
  row,
  components,
  published,
}: {
  courseId: string;
  row: MarksGridRow;
  components: AssessmentComponent[];
  published: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveRowAction, {} as MarksFormState);
  // A <form> can't wrap a <tr> (invalid HTML → hydration errors), so the form
  // lives inside the last cell and the row's inputs attach via form="id".
  const formId = `marks-row-${row.userId}`;

  return (
    <tr className="border-b border-border hover:bg-primary-soft">
      <td className="py-2 pr-3">
        {row.name}
        {row.studentId ? <span className="num ml-2 text-xs text-muted">{row.studentId}</span> : null}
      </td>
      <td className="py-2 pr-3">{row.section}</td>
      {components.map((c) => (
        <td key={c.key} className="py-2 pr-3">
          <input
            form={formId}
            name={`score-${c.key}`}
            type="number"
            min="0"
            max={c.maxMarks}
            step="0.5"
            defaultValue={row.scores[c.key] ?? ""}
            className={`num w-16 ${compactInputClass}`}
            aria-label={`${row.name} ${c.name}`}
          />
          <span className="num ml-1 text-xs text-muted">/{c.maxMarks}</span>
        </td>
      ))}
      <td className="num py-2 pr-3 font-semibold">{row.total}</td>
      <td className="py-2 pr-3">
        <span className="num rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-hover">
          {row.grade} · {row.gradePoint.toFixed(2)}
        </span>
      </td>
      <td className="py-2">
        <form id={formId} action={formAction} className="contents">
          {published ? (
            <input
              name="reason"
              placeholder="Reason (admin override)"
              className={`mb-1 block w-40 text-xs ${compactInputClass}`}
              aria-label={`Override reason for ${row.name}`}
            />
          ) : null}
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="userId" value={row.userId} />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
          {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
        </form>
      </td>
    </tr>
  );
}

/** UCM-F23/F25: publish toggle (teacher) with the admin-override note. */
export function PublishToggle({ courseId, published }: { courseId: string; published: boolean }) {
  const [state, formAction, pending] = useActionState(setPublishedAction, {} as MarksFormState);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={formAction} className="inline-flex flex-col gap-2">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="published" value={published ? "false" : "true"} />
      {published ? (
        <ConfirmButton
          confirm="Unpublish results? Students currently seeing their marks will lose access until you publish again."
          onConfirm={() => formRef.current?.requestSubmit()}
          pending={pending}
          busyLabel="Unpublishing…"
          variant="danger"
          size="md"
        >
          Unpublish results
        </ConfirmButton>
      ) : (
        <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Publishing…" : "Publish results"}
        </Button>
      )}
    </form>
  );
}
