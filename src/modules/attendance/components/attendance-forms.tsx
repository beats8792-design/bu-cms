"use client";

import { useActionState } from "react";
import {
  closeSessionAction,
  openSessionAction,
  saveRosterAction,
  setThresholdAction,
  type AttendanceFormState,
} from "@/modules/attendance/actions";
import type { AttendanceRecord } from "@/modules/attendance/schema";

/** UCM-F15: open a session (course + section + Dhaka date + topic). */
export function OpenSessionForm({
  courseId,
  sections,
  today,
}: {
  courseId: string;
  sections: string[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(openSessionAction, {} as AttendanceFormState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
      {state.error ? (
        <p role="alert" className="w-full rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
      ) : null}
      <input type="hidden" name="courseId" value={courseId} />
      <label className="text-sm font-medium">
        Date <span className="text-muted">(Asia/Dhaka)</span>
        <input type="date" name="date" required defaultValue={today} className="mt-1 block rounded-md border border-border px-3 py-2" />
      </label>
      <label className="text-sm font-medium">
        Section
        <select name="section" defaultValue="A" className="mt-1 block rounded-md border border-border px-3 py-2">
          {sections.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-48 flex-1 text-sm font-medium">
        Topic <span className="text-muted">(optional)</span>
        <input name="topic" placeholder="e.g. Chapter 4 — Joins" className="mt-1 block w-full rounded-md border border-border px-3 py-2" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Opening…" : "Open session"}
      </button>
    </form>
  );
}

/** Teacher roster marking (one row per student, present/absent/late). */
export function RosterForm({
  courseId,
  sessionId,
  sessionStatus,
  students,
  records,
}: {
  courseId: string;
  sessionId: string;
  sessionStatus: "open" | "closed";
  students: Array<{ userId: string; name: string; studentId: string; section: string }>;
  records: AttendanceRecord[];
}) {
  const [state, formAction, pending] = useActionState(saveRosterAction, {} as AttendanceFormState);
  const byUser = new Map(records.map((r) => [r.userId, r.status]));
  const editable = sessionStatus === "open";

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
      ) : null}
      {state.ok ? <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-hover">Attendance saved.</p> : null}
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="courseId" value={courseId} />

      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Attendance marks</caption>
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th className="py-2 pr-3 font-medium">Student</th>
            <th className="py-2 pr-3 font-medium">Present</th>
            <th className="py-2 pr-3 font-medium">Absent</th>
            <th className="py-2 pr-3 font-medium">Late</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const current = byUser.get(s.userId);
            return (
              <tr key={s.userId} className="border-b border-border hover:bg-primary-soft">
                <td className="py-2 pr-3">
                  {s.name}
                  {s.studentId ? <span className="num ml-2 text-xs text-muted">{s.studentId}</span> : null}
                </td>
                {(["present", "absent", "late"] as const).map((st) => (
                  <td key={st} className="py-2 pr-3">
                    <input
                      type="radio"
                      name={`status-${s.userId}`}
                      value={st}
                      defaultChecked={current === st}
                      disabled={!editable}
                      className="accent-primary"
                      aria-label={`${s.name} ${st}`}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      {editable ? (
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save attendance"}
        </button>
      ) : (
        <p className="text-sm text-muted">This session is closed — attendance is frozen.</p>
      )}
    </form>
  );
}

/** Close / reopen toggle (manager only). */
export function CloseReopenButton({
  courseId,
  sessionId,
  closed,
}: {
  courseId: string;
  sessionId: string;
  closed: boolean;
}) {
  const [state, formAction, pending] = useActionState(closeSessionAction, {} as AttendanceFormState);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="closed" value={closed ? "false" : "true"} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border px-3 py-1 text-xs font-medium hover:bg-primary-soft disabled:opacity-60"
      >
        {pending ? "…" : closed ? "Reopen" : "Close session"}
      </button>
      {state.error ? <span className="ml-2 text-xs text-danger">{state.error}</span> : null}
    </form>
  );
}

/** Per-course threshold override (UCM-F17, default 75%). */
export function ThresholdForm({ courseId, current }: { courseId: string; current: number }) {
  const [state, formAction, pending] = useActionState(setThresholdAction, {} as AttendanceFormState);
  return (
    <form action={formAction} className="flex items-end gap-2">
      {state.error ? <p className="text-xs text-danger">{state.error}</p> : null}
      {state.ok ? <p className="text-xs text-primary-hover">Saved.</p> : null}
      <input type="hidden" name="courseId" value={courseId} />
      <label className="text-sm font-medium">
        Warning threshold %
        <input
          name="threshold"
          type="number"
          min="1"
          max="100"
          required
          defaultValue={current}
          className="num mt-1 block w-24 rounded-md border border-border px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-primary-soft disabled:opacity-60"
      >
        {pending ? "Saving…" : "Set"}
      </button>
    </form>
  );
}
