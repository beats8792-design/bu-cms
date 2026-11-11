"use client";

import { useActionState } from "react";
import { importCsvAction, type AdminActionState } from "@/modules/admin/actions";

const initial: AdminActionState = {};

export function ImportForm() {
  const [state, formAction, pending] = useActionState(importCsvAction, initial);

  return (
    <div className="flex flex-col gap-4">
      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
      ) : null}
      {state.summary ? (
        <div className="rounded-md border border-primary-soft bg-primary-soft px-3 py-2 text-sm text-primary-hover">
          Imported <strong>{state.summary.imported}</strong> accounts
          {state.summary.existing ? <> · {state.summary.existing} already existed</> : null}
          {state.summary.duplicatesInFile ? <> · {state.summary.duplicatesInFile} duplicates skipped</> : null}
          {state.summary.skipped.length ? (
            <ul className="mt-2 list-inside list-disc text-xs">
              {state.summary.skipped.slice(0, 5).map((s) => (
                <li key={s.index}>Row {s.index}: {s.reason}</li>
              ))}
              {state.summary.skipped.length > 5 ? (
                <li>…and {state.summary.skipped.length - 5} more</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}

      <form action={formAction} className="flex flex-col gap-3">
        <label className="text-sm font-medium">
          Paste CSV (or type rows)
          <textarea
            name="csv"
            required
            rows={8}
            placeholder={"name,email,role,studentId\nAnisur Rahman,anis@versity.edu,student,2021-ESD-001"}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 font-mono text-xs"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "Importing…" : "Import"}
        </button>
      </form>
    </div>
  );
}
