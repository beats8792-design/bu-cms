"use client";

import { useActionState } from "react";
import { importCsvAction, type AdminActionState } from "@/modules/admin/actions";
import { Button, Notice } from "@/components/ui";

const initial: AdminActionState = {};

export function ImportForm() {
  const [state, formAction, pending] = useActionState(importCsvAction, initial);

  return (
    <div className="flex flex-col gap-4">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.summary ? (
        <>
          <Notice tone="success">
            Imported <strong>{state.summary.imported}</strong> accounts
            {state.summary.existing ? <> · {state.summary.existing} already existed</> : null}
            {state.summary.duplicatesInFile ? <> · {state.summary.duplicatesInFile} duplicates skipped</> : null}
          </Notice>
          {state.summary.skipped.length ? (
            <ul className="list-inside list-disc text-xs text-muted">
              {state.summary.skipped.slice(0, 5).map((s) => (
                <li key={s.index}>Row {s.index}: {s.reason}</li>
              ))}
              {state.summary.skipped.length > 5 ? (
                <li>…and {state.summary.skipped.length - 5} more</li>
              ) : null}
            </ul>
          ) : null}
        </>
      ) : null}

      <form action={formAction} className="flex flex-col gap-3">
        <label className="text-sm font-medium">
          Paste CSV (or type rows)
          <textarea
            name="csv"
            required
            rows={8}
            placeholder={"name,email,role,studentId\nAnisur Rahman,anis@versity.edu,student,2021-ESD-001"}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <Button
          type="submit"
          variant="primary"
          className="self-start"
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {pending ? "Importing…" : "Import"}
        </Button>
      </form>
    </div>
  );
}
