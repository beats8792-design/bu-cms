"use client";

import { useActionState, useState } from "react";
import {
  approveResourceAction,
  createGroupAction,
  createNoteAction,
  createResourceAction,
  deleteGroupAction,
  joinGroupAction,
  leaveGroupAction,
  removeMemberAction,
  saveGroupNotesAction,
  toggleNotePinAction,
  deleteNoteAction,
  deleteResourceAction,
  type CollabFormState,
} from "@/modules/collab/actions";
import type { CourseNote, LibraryResource, StudyGroup } from "@/modules/collab/schema";

/* --------------------------------------------------------- shared uploader */

/**
 * Browser-direct signed Cloudinary upload (kind: note | library). Fills
 * hidden fields the wrapping form posts to the server action.
 */
export function CollabFilePicker({
  kind,
  courseId,
  idPrefix,
  label = "File (PDF or image · max 30 MB)",
}: {
  kind: "note" | "library";
  courseId?: string;
  idPrefix: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ publicId: string; fileName: string; size: number } | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const signRes = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, courseId }),
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
      form.append("file", file);
      form.append("api_key", signed.apiKey);
      form.append("timestamp", String(signed.timestamp));
      form.append("signature", signed.signature);
      form.append("folder", signed.folder);
      const upRes = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/raw/upload`, {
        method: "POST",
        body: form,
      });
      const up = (await upRes.json()) as { public_id?: string; error?: { message: string } };
      if (!upRes.ok || !up.public_id) throw new Error(up.error?.message ?? "Upload to storage failed.");
      setPicked({ publicId: up.public_id, fileName: file.name, size: file.size });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">{label}</p>
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-2 py-1 text-xs text-danger">{error}</p> : null}
      {picked ? (
        <p className="text-sm">
          <span className="rounded bg-primary-soft px-2 py-0.5 text-xs">attached</span>{" "}
          {picked.fileName}{" "}
          <span className="num text-xs text-muted">{(picked.size / 1024 / 1024).toFixed(1)} MB</span>
          <input type="hidden" name={`${idPrefix}PublicId`} value={picked.publicId} />
          <input type="hidden" name={`${idPrefix}FileName`} value={picked.fileName} />
          <input type="hidden" name={`${idPrefix}Size`} value={picked.size} />
        </p>
      ) : (
        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={pick} disabled={busy} className="text-sm" />
      )}
      {busy ? <p className="text-xs text-muted">Uploading…</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------- notes */

/** UCM-C1: publish a note (title + file) for a course. */
export function NoteUploader({ courseId }: { courseId: string }) {
  const [state, formAction, pending] = useActionState(createNoteAction, {} as CollabFormState);
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      {state.error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      {state.ok ? <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-hover">Note published.</p> : null}
      <input type="hidden" name="courseId" value={courseId} />
      <label className="text-sm font-medium">
        Title
        <input name="title" required minLength={3} maxLength={160} className="mt-1 w-full rounded-md border border-border px-3 py-2" />
      </label>
      <CollabFilePicker kind="note" courseId={courseId} idPrefix="file" />
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Publishing…" : "Publish note"}
      </button>
    </form>
  );
}

export function NoteActions({ note, canPin, canDelete }: { note: CourseNote; canPin: boolean; canDelete: boolean }) {
  const [pinState, pinAction, pinPending] = useActionState(toggleNotePinAction, {} as CollabFormState);
  const [delState, delAction, delPending] = useActionState(deleteNoteAction, {} as CollabFormState);
  return (
    <p className="flex gap-3">
      {canPin ? (
        <form action={pinAction} className="inline">
          <input type="hidden" name="id" value={note.id} />
          <input type="hidden" name="pinned" value={note.pinned ? "false" : "true"} />
          <button type="submit" disabled={pinPending} className="text-xs underline">
            {pinPending ? "…" : note.pinned ? "Unpin" : "Pin"}
          </button>
        </form>
      ) : null}
      {canDelete ? (
        <form action={delAction} className="inline">
          <input type="hidden" name="id" value={note.id} />
          <button type="submit" disabled={delPending} className="text-xs text-danger underline">
            {delPending ? "…" : "Delete"}
          </button>
        </form>
      ) : null}
      {(pinState.error ?? delState.error) ? <span className="text-xs text-danger">{pinState.error ?? delState.error}</span> : null}
    </p>
  );
}

/* ------------------------------------------------------------------ library */

/** UCM-C2: upload with tags (kind, dept, course, semester). */
export function LibraryUploader({
  departments,
  courses,
  semesters,
}: {
  departments: Array<{ id: string; code: string; name: string }>;
  courses: Array<{ id: string; code: string; title: string }>;
  semesters: Array<{ id: string; label: string }>;
}) {
  const [state, formAction, pending] = useActionState(createResourceAction, {} as CollabFormState);
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      {state.error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      {state.ok ? <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-hover">Published to the library.</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Title
          <input name="title" required minLength={3} maxLength={160} className="mt-1 w-full rounded-md border border-border px-3 py-2" />
        </label>
        <label className="text-sm font-medium">
          Kind
          <select name="kind" className="mt-1 w-full rounded-md border border-border px-3 py-2">
            <option value="past-paper">Past paper</option>
            <option value="guide">Senior&apos;s guide</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Department <span className="text-muted">(tag, optional)</span>
          <select name="departmentId" className="mt-1 w-full rounded-md border border-border px-3 py-2">
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Course <span className="text-muted">(tag, optional)</span>
          <select name="courseId" className="mt-1 w-full rounded-md border border-border px-3 py-2">
            <option value="">—</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Semester <span className="text-muted">(tag, optional)</span>
          <select name="semesterId" className="mt-1 w-full rounded-md border border-border px-3 py-2">
            <option value="">—</option>
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="text-sm font-medium">
        Description <span className="text-muted">(optional)</span>
        <textarea name="description" rows={2} maxLength={1000} className="mt-1 w-full rounded-md border border-border px-3 py-2" />
      </label>

      <CollabFilePicker kind="library" idPrefix="file" />
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Publishing…" : "Publish resource"}
      </button>
    </form>
  );
}

export function ResourceActions({
  resource,
  userId,
  isAdmin,
}: {
  resource: LibraryResource;
  userId: string;
  isAdmin: boolean;
}) {
  const [delState, delAction, delPending] = useActionState(deleteResourceAction, {} as CollabFormState);
  const [apprState, apprAction, apprPending] = useActionState(approveResourceAction, {} as CollabFormState);
  const own = resource.uploaderId === userId;
  return (
    <p className="flex gap-3">
      {own || isAdmin ? (
        <form action={delAction} className="inline">
          <input type="hidden" name="id" value={resource.id} />
          <button type="submit" disabled={delPending} className="text-xs text-danger underline">
            {delPending ? "…" : "Delete"}
          </button>
        </form>
      ) : null}
      {isAdmin ? (
        <form action={apprAction} className="inline">
          <input type="hidden" name="id" value={resource.id} />
          <input type="hidden" name="approved" value={resource.approved ? "false" : "true"} />
          <button type="submit" disabled={apprPending} className="text-xs underline">
            {apprPending ? "…" : resource.approved ? "Hide" : "Approve"}
          </button>
        </form>
      ) : null}
      {(delState.error ?? apprState.error) ? <span className="text-xs text-danger">{delState.error ?? apprState.error}</span> : null}
    </p>
  );
}

/* ------------------------------------------------------------------- groups */

export function GroupCreator({ courses }: { courses: Array<{ id: string; code: string; title: string }> }) {
  const [state, formAction, pending] = useActionState(createGroupAction, {} as CollabFormState);
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      {state.error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      {state.ok ? <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-hover">Group created.</p> : null}
      <label className="text-sm font-medium">
        Course
        <select name="courseId" required className="mt-1 w-full rounded-md border border-border px-3 py-2">
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.title}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        Group name
        <input name="name" required minLength={3} maxLength={80} className="mt-1 w-full rounded-md border border-border px-3 py-2" />
      </label>
      <label className="text-sm font-medium">
        Description <span className="text-muted">(optional)</span>
        <textarea name="description" rows={2} maxLength={500} className="mt-1 w-full rounded-md border border-border px-3 py-2" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create group"}
      </button>
    </form>
  );
}

export function GroupMembershipButtons({
  group,
  isMember,
  isOwner,
  userId,
}: {
  group: StudyGroup;
  isMember: boolean;
  isOwner: boolean;
  userId: string;
}) {
  const [joinState, joinAction, joinPending] = useActionState(joinGroupAction, {} as CollabFormState);
  const [leaveState, leaveAction, leavePending] = useActionState(leaveGroupAction, {} as CollabFormState);
  const [delState, delAction, delPending] = useActionState(deleteGroupAction, {} as CollabFormState);
  const [remState, remAction, remPending] = useActionState(removeMemberAction, {} as CollabFormState);
  const error = joinState.error ?? leaveState.error ?? delState.error ?? remState.error;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {!isMember ? (
        <form action={joinAction} className="inline">
          <input type="hidden" name="id" value={group.id} />
          <button
            type="submit"
            disabled={joinPending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {joinPending ? "…" : "Join group"}
          </button>
        </form>
      ) : null}
      {isMember && !isOwner ? (
        <form action={leaveAction} className="inline">
          <input type="hidden" name="id" value={group.id} />
          <button type="submit" disabled={leavePending} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-primary-soft">
            {leavePending ? "…" : "Leave"}
          </button>
        </form>
      ) : null}
      {isOwner ? (
        <form action={delAction} className="inline">
          <input type="hidden" name="id" value={group.id} />
          <button type="submit" disabled={delPending} className="text-sm text-danger underline">
            {delPending ? "…" : "Delete group"}
          </button>
        </form>
      ) : null}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
      {isOwner
        ? group.members
            .filter((m) => m.userId !== userId)
            .map((m) => (
              <form key={m.userId} action={remAction} className="inline">
                <input type="hidden" name="id" value={group.id} />
                <input type="hidden" name="memberId" value={m.userId} />
                <button type="submit" disabled={remPending} className="text-xs text-danger underline">
                  remove {m.name.split(" ")[0]}
                </button>
              </form>
            ))
        : null}
    </div>
  );
}

export function Notepad({ group }: { group: StudyGroup }) {
  const [state, formAction, pending] = useActionState(saveGroupNotesAction, {} as CollabFormState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      {state.error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      {state.ok ? <p className="text-xs text-primary-hover">Saved.</p> : null}
      <input type="hidden" name="id" value={group.id} />
      <textarea
        name="notes"
        rows={10}
        defaultValue={group.notes}
        maxLength={20000}
        placeholder="Shared notepad — everyone in the group can edit. Study plans, links, division of topics…"
        className="w-full rounded-md border border-border px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save notepad"}
        </button>
        {group.notesUpdatedAt ? (
          <p className="num text-xs text-muted">
            Last edit {group.notesUpdatedAt.slice(0, 16).replace("T", " ")}
            {group.notesUpdatedByName ? ` by ${group.notesUpdatedByName}` : ""}
          </p>
        ) : null}
      </div>
    </form>
  );
}
