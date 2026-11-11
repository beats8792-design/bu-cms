"use client";

import { useActionState, useState } from "react";
import {
  createAssignmentAction,
  deleteAssignmentAction,
  updateAssignmentAction,
  type AssignmentFormState,
} from "@/modules/assignments/actions";
import type { Assignment } from "@/modules/assignments/schema";
import { isoToDhakaParts } from "@/modules/assignments/schema";

interface AttachmentRef {
  publicId: string;
  fileName: string;
  size: number;
}

/** Shared uploader box for assignment attachments + submission files. */
export function AssignmentFilePicker({
  kind,
  courseId,
  assignmentId,
  label,
  initial,
  onChange,
}: {
  kind: "assignment-attachment" | "submission";
  courseId: string;
  assignmentId?: string;
  label: string;
  initial?: AttachmentRef[];
  onChange?: (files: AttachmentRef[]) => void;
}) {
  const [files, setFiles] = useState<AttachmentRef[]>(initial ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const chosen = Array.from(e.target.files ?? []);
    if (chosen.length === 0) return;
    setBusy(true);
    const uploaded: AttachmentRef[] = [];
    try {
      for (const f of chosen) {
        const signRes = await fetch("/api/uploads/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, courseId, assignmentId }),
        });
        const signed = (await signRes.json()) as {
          cloudName: string;
          apiKey: string;
          timestamp: number;
          signature: string;
          folder: string;
          error?: string;
        };
        if (!signRes.ok) throw new Error(signed.error ?? "Could not start the upload.");

        const form = new FormData();
        form.append("file", f);
        form.append("api_key", signed.apiKey);
        form.append("timestamp", String(signed.timestamp));
        form.append("signature", signed.signature);
        form.append("folder", signed.folder);
        const upRes = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/raw/upload`, {
          method: "POST",
          body: form,
        });
        const up = (await upRes.json()) as { public_id?: string; error?: { message: string } };
        if (!upRes.ok || !up.public_id) {
          throw new Error(up.error?.message ?? "Upload to storage failed.");
        }
        uploaded.push({ publicId: up.public_id, fileName: f.name, size: f.size });
      }
      const next = [...files, ...uploaded].slice(0, 5);
      setFiles(next);
      onChange?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  function remove(i: number) {
    const next = files.filter((_, j) => j !== i);
    setFiles(next);
    onChange?.(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">
        {label} <span className="text-muted">(PDF/DOCX/PPTX/ZIP · max 30 MB each · up to 5)</span>
      </p>
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="rounded bg-primary-soft px-2 py-0.5 text-xs">attached</span>
          <span>{f.fileName}</span>
          <span className="num text-xs text-muted">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
          <input type="hidden" name={kind === "submission" ? "file" : "attachment"} value={f.publicId} />
          <input type="hidden" name={kind === "submission" ? "fileName" : "attachmentName"} value={f.fileName} />
          <input type="hidden" name={kind === "submission" ? "fileSize" : "attachmentSize"} value={f.size} />
          <button type="button" onClick={() => remove(i)} className="text-danger underline">
            remove
          </button>
        </div>
      ))}
      {files.length < 5 ? (
        <input type="file" multiple accept=".pdf,.docx,.pptx,.zip" onChange={pick} disabled={busy} className="text-sm" />
      ) : null}
      {busy ? <p className="text-xs text-muted">Uploading…</p> : null}
    </div>
  );
}

export function AssignmentForm({
  courseId,
  assignment,
}: {
  courseId: string;
  assignment?: Assignment;
}) {
  const editing = Boolean(assignment);
  const [state, formAction, pending] = useActionState(
    editing ? updateAssignmentAction : createAssignmentAction,
    {} as AssignmentFormState,
  );
  const [showForm, setShowForm] = useState(!editing);
  const dhaka = assignment ? isoToDhakaParts(assignment.deadline) : null;

  if (!showForm) {
    return (
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
      >
        Add assignment
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      {state.error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
      ) : null}
      {state.ok ? <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-hover">Saved.</p> : null}
      {editing ? <input type="hidden" name="id" value={assignment!.id} /> : null}
      <input type="hidden" name="courseId" value={courseId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Title
          <input name="title" required defaultValue={assignment?.title ?? ""} className="mt-1 w-full rounded-md border border-border px-3 py-2" />
        </label>
        <label className="text-sm font-medium">
          Points
          <input
            name="points"
            type="number"
            min="1"
            max="1000"
            required
            defaultValue={assignment?.points ?? 10}
            className="mt-1 w-full rounded-md border border-border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          Deadline date <span className="text-muted">(Asia/Dhaka)</span>
          <input type="date" name="deadlineDate" required defaultValue={dhaka?.date ?? ""} className="mt-1 w-full rounded-md border border-border px-3 py-2" />
        </label>
        <label className="text-sm font-medium">
          Deadline time <span className="text-muted">(Asia/Dhaka)</span>
          <input type="time" name="deadlineTime" required defaultValue={dhaka?.time ?? "23:59"} className="mt-1 w-full rounded-md border border-border px-3 py-2" />
        </label>
      </div>

      <label className="text-sm font-medium">
        Description
        <textarea name="description" rows={4} defaultValue={assignment?.description ?? ""} className="mt-1 w-full rounded-md border border-border px-3 py-2" />
      </label>

      <label className="text-sm font-medium">
        Late submissions
        <select name="latePolicy" defaultValue={assignment?.latePolicy ?? "allow"} className="mt-1 w-full rounded-md border border-border px-3 py-2">
          <option value="allow">Allowed, automatically flagged late</option>
          <option value="block">Blocked after the deadline</option>
        </select>
      </label>

      <AssignmentFilePicker
        kind="assignment-attachment"
        courseId={courseId}
        assignmentId={assignment?.id}
        label="Attachments"
        initial={assignment?.attachments ?? []}
      />

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : editing ? "Save changes" : "Create assignment"}
        </button>
        {editing ? (
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-primary-soft"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function DeleteAssignmentButton({ assignmentId, courseId }: { assignmentId: string; courseId: string }) {
  const [state, formAction, pending] = useActionState(deleteAssignmentAction, {} as AssignmentFormState);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={assignmentId} />
      <input type="hidden" name="courseId" value={courseId} />
      <button type="submit" disabled={pending} className="text-xs text-danger underline">
        {pending ? "…" : "Delete"}
      </button>
      {state.error ? <span className="ml-2 text-xs text-danger">{state.error}</span> : null}
    </form>
  );
}
