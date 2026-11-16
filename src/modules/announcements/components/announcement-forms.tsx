"use client";

import { useActionState, useRef, useState } from "react";
import {
  createAnnouncementAction,
  deleteAnnouncementAction,
  togglePinAction,
  updateAnnouncementAction,
  type AnnouncementFormState,
} from "@/modules/announcements/actions";
import type { Announcement } from "@/modules/announcements/schema";
import { Button, ConfirmButton, Notice, compactInputClass, inputClass } from "@/components/ui";

export interface CourseOption {
  id: string;
  code: string;
  title: string;
  section: string;
}

/** UCM-R2: compose form with a scope picker (options differ per role). */
export function AnnouncementComposer({
  scopes,
  courses,
  departments,
}: {
  scopes: Array<{ value: Announcement["scope"]; label: string }>;
  courses: CourseOption[];
  departments: Array<{ id: string; code: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(createAnnouncementAction, {} as AnnouncementFormState);
  const [scope, setScope] = useState(scopes[0]?.value ?? "course");

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      {state.error ? (
        <Notice tone="danger">{state.error}</Notice>
      ) : null}
      {state.ok ? <Notice tone="success">Posted — audience notified.</Notice> : null}

      <div className="flex flex-wrap gap-3">
        <label className="text-sm font-medium">
          Scope
          <select
            name="scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as Announcement["scope"])}
            className={`${inputClass} block`}
          >
            {scopes.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        {scope === "department" ? (
          <label className="text-sm font-medium">
            Department
            <select name="refId" required className={`${inputClass} block`}>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {scope === "course" || scope === "section" ? (
          <label className="text-sm font-medium">
            Course
            <select name="refId" required className={`${inputClass} block`}>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {scope === "section" ? (
          <label className="text-sm font-medium">
            Section
            <input name="section" required defaultValue={courses[0]?.section ?? "A"} className="mt-1 w-24 rounded-lg border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
          </label>
        ) : null}
      </div>

      <label className="text-sm font-medium">
        Title
        <input name="title" required minLength={3} maxLength={160} className={inputClass} />
      </label>
      <label className="text-sm font-medium">
        Message
        <textarea name="body" required rows={3} maxLength={4000} className={inputClass} />
      </label>

      <Button type="submit" variant="primary" size="sm" className="self-start" disabled={pending} aria-busy={pending || undefined}>
        {pending ? "Posting…" : "Post announcement"}
      </Button>
    </form>
  );
}

/** Edit-in-place for the author/admin (title + body only; scope immutable). */
export function AnnouncementEditForm({ announcement }: { announcement: Announcement }) {
  const [state, formAction, pending] = useActionState(updateAnnouncementAction, {} as AnnouncementFormState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary underline">
        Edit
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
      {state.error ? <Notice tone="danger" className="text-xs">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success" className="text-xs">Saved.</Notice> : null}
      <input type="hidden" name="id" value={announcement.id} />
      <input type="hidden" name="scope" value={announcement.scope} />
      <input type="hidden" name="refId" value={announcement.refId} />
      <input type="hidden" name="section" value={announcement.section} />
      <input name="title" required defaultValue={announcement.title} className={compactInputClass} />
      <textarea name="body" required rows={3} defaultValue={announcement.body} className={compactInputClass} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function PinButton({ id, pinned }: { id: string; pinned: boolean }) {
  const [state, formAction, pending] = useActionState(togglePinAction, {} as AnnouncementFormState);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="pinned" value={pinned ? "false" : "true"} />
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className="text-xs underline">
        {pending ? (pinned ? "Unpinning…" : "Pinning…") : pinned ? "Unpin" : "Pin"}
      </button>
      {state.error ? <Notice tone="danger" className="mt-1 text-xs">{state.error}</Notice> : null}
    </form>
  );
}

export function DeleteAnnouncementButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(deleteAnnouncementAction, {} as AnnouncementFormState);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={formAction} className="inline-flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <ConfirmButton
        confirm="Delete this announcement? Everyone it was sent to loses access to it."
        onConfirm={() => formRef.current?.requestSubmit()}
        pending={pending}
        busyLabel="Deleting…"
        variant="dangerLink"
        size="sm"
      >
        Delete
      </ConfirmButton>
      {state.error ? <Notice tone="danger" className="text-xs">{state.error}</Notice> : null}
    </form>
  );
}
