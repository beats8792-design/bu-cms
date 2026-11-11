"use client";

import { useActionState, useState } from "react";
import { saveRowAction, saveSchemaAction, setPublishedAction, type MarksFormState } from "@/modules/marks/actions";
import type { AssessmentComponent, MarksGridRow } from "@/modules/marks/schema";

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
      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
      ) : null}
      {state.ok ? <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-hover">Assessment plan saved.</p> : null}
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
                  className="num w-24 rounded-md border border-border px-2 py-1 read-only:bg-primary-soft"
                />
              </td>
              <td className="py-1 pr-2">
                <input name={`name-${i}`} required defaultValue={c.name} className="w-40 rounded-md border border-border px-2 py-1" />
              </td>
              <td className="py-1 pr-2">
                <input name={`max-${i}`} type="number" min="1" max="1000" required defaultValue={c.maxMarks} className="num w-20 rounded-md border border-border px-2 py-1" />
              </td>
              <td className="py-1 pr-2">
                <input name={`weight-${i}`} type="number" min="1" max="100" required defaultValue={c.weight} className="num w-16 rounded-md border border-border px-2 py-1" />
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
          Weights: {weightSum}/100 {weightSum === 100 ? "✓" : "— must be exactly 100"}
        </span>
        <button
          type="submit"
          disabled={pending || weightSum !== 100}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save plan"}
        </button>
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

  return (
    <form action={formAction} className="contents">
      <tr className="border-b border-border hover:bg-primary-soft">
        <td className="py-2 pr-3">
          {row.name}
          {row.studentId ? <span className="num ml-2 text-xs text-muted">{row.studentId}</span> : null}
        </td>
        <td className="py-2 pr-3">{row.section}</td>
        {components.map((c) => (
          <td key={c.key} className="py-2 pr-3">
            <input
              name={`score-${c.key}`}
              type="number"
              min="0"
              max={c.maxMarks}
              step="0.5"
              defaultValue={row.scores[c.key] ?? ""}
              className="num w-16 rounded-md border border-border px-2 py-1"
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
          {published ? (
            <input
              name="reason"
              placeholder="Reason (admin override)"
              className="mb-1 block w-40 rounded-md border border-border px-2 py-1 text-xs"
              aria-label={`Override reason for ${row.name}`}
            />
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-primary px-3 py-1 text-xs font-medium text-primary hover:bg-primary-soft disabled:opacity-60"
          >
            {pending ? "…" : "Save"}
          </button>
          {state.error ? <p className="text-xs text-danger">{state.error}</p> : null}
        </td>
      </tr>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="userId" value={row.userId} />
    </form>
  );
}

/** UCM-F23/F25: publish toggle (teacher) with the admin-override note. */
export function PublishToggle({ courseId, published }: { courseId: string; published: boolean }) {
  const [state, formAction, pending] = useActionState(setPublishedAction, {} as MarksFormState);
  return (
    <form action={formAction} className="inline">
      {state.error ? <span className="mr-2 text-xs text-danger">{state.error}</span> : null}
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="published" value={published ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
          published ? "bg-danger hover:bg-danger" : "bg-primary hover:bg-primary-hover"
        }`}
      >
        {pending ? "…" : published ? "Unpublish results" : "Publish results"}
      </button>
    </form>
  );
}
