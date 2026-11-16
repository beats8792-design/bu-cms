"use client";

import { useActionState, useRef, useState } from "react";
import {
  createAssignmentAction,
  deleteAssignmentAction,
  updateAssignmentAction,
  type AssignmentFormState,
} from "@/modules/assignments/actions";
import type { Assignment } from "@/modules/assignments/schema";
import { isoToDhakaParts } from "@/modules/assignments/schema";
import { Badge, Button, ConfirmButton, Notice, inputClass } from "@/components/ui";

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
    let current: File | null = null;
    try {
      for (const f of chosen) {
        current = f;
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
      // Keep files that already uploaded so Cloudinary records aren't orphaned.
      const next = [...files, ...uploaded].slice(0, 5);
      setFiles(next);
      onChange?.(next);
      const message = err instanceof Error ? err.message : "Upload failed.";
      setError(current ? `${current.name}: ${message}` : message);
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
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <Badge tone="info">attached</Badge>
          <span>{f.fileName}</span>
          <span className="num text-xs text-muted">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
          <input type="hidden" name={kind === "submission" ? "file" : "attachment"} value={f.publicId} />
          <input type="hidden" name={kind === "submission" ? "fileName" : "attachmentName"} value={f.fileName} />
          <input type="hidden" name={kind === "submission" ? "fileSize" : "attachmentSize"} value={f.size} />
          <button
            type="button"
            onClick={() => remove(i)}
            disabled={busy}
            className="text-danger underline disabled:opacity-60"
          >
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
      <Button onClick={() => setShowForm(true)}>Add assignment</Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">Saved.</Notice> : null}
      {editing ? <input type="hidden" name="id" value={assignment!.id} /> : null}
      <input type="hidden" name="courseId" value={courseId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Title
          <input name="title" required defaultValue={assignment?.title ?? ""} className={inputClass} />
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
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium">
          Deadline date <span className="text-muted">(Asia/Dhaka)</span>
          <input type="date" name="deadlineDate" required defaultValue={dhaka?.date ?? ""} className={inputClass} />
        </label>
        <label className="text-sm font-medium">
          Deadline time <span className="text-muted">(Asia/Dhaka)</span>
          <input type="time" name="deadlineTime" required defaultValue={dhaka?.time ?? "23:59"} className={inputClass} />
        </label>
      </div>

      <label className="text-sm font-medium">
        Description
        <textarea name="description" rows={4} defaultValue={assignment?.description ?? ""} className={inputClass} />
      </label>

      <label className="text-sm font-medium">
        Late submissions
        <select name="latePolicy" defaultValue={assignment?.latePolicy ?? "allow"} className={inputClass}>
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
        <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Saving…" : editing ? "Save changes" : "Create assignment"}
        </Button>
        {editing ? (
          <Button variant="secondary" size="md" onClick={() => setShowForm(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function DeleteAssignmentButton({ assignmentId, courseId }: { assignmentId: string; courseId: string }) {
  const [state, formAction, pending] = useActionState(deleteAssignmentAction, {} as AssignmentFormState);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={formAction} className="inline-flex flex-col gap-2">
      <input type="hidden" name="id" value={assignmentId} />
      <input type="hidden" name="courseId" value={courseId} />
      <ConfirmButton
        confirm="Delete this assignment? Student submissions and marks attached to it are also removed."
        onConfirm={() => formRef.current?.requestSubmit()}
        pending={pending}
        busyLabel="Deleting…"
        variant="dangerLink"
        size="sm"
      >
        Delete
      </ConfirmButton>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
    </form>
  );
}
