"use client";

import { useActionState, useState } from "react";
import {
  createAnnouncementAction,
  deleteAnnouncementAction,
  togglePinAction,
  updateAnnouncementAction,
  type AnnouncementFormState,
} from "@/modules/announcements/actions";
import type { Announcement } from "@/modules/announcements/schema";

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
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
      ) : null}
      {state.ok ? <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-hover">Posted — audience notified.</p> : null}

      <div className="flex flex-wrap gap-3">
        <label className="text-sm font-medium">
          Scope
          <select
            name="scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as Announcement["scope"])}
            className="mt-1 block rounded-md border border-border px-3 py-2"
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
            <select name="refId" required className="mt-1 block rounded-md border border-border px-3 py-2">
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
            <select name="refId" required className="mt-1 block rounded-md border border-border px-3 py-2">
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
            <input name="section" required defaultValue={courses[0]?.section ?? "A"} className="mt-1 w-24 rounded-md border border-border px-3 py-2" />
          </label>
        ) : null}
      </div>

      <label className="text-sm font-medium">
        Title
        <input name="title" required minLength={3} maxLength={160} className="mt-1 w-full rounded-md border border-border px-3 py-2" />
      </label>
      <label className="text-sm font-medium">
        Message
        <textarea name="body" required rows={3} maxLength={4000} className="mt-1 w-full rounded-md border border-border px-3 py-2" />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {pending ? "Posting…" : "Post announcement"}
      </button>
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
    <form action={formAction} className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-bg p-3">
      {state.error ? <p className="text-xs text-danger">{state.error}</p> : null}
      {state.ok ? <p className="text-xs text-primary-hover">Saved.</p> : null}
      <input type="hidden" name="id" value={announcement.id} />
      <input type="hidden" name="scope" value={announcement.scope} />
      <input type="hidden" name="refId" value={announcement.refId} />
      <input type="hidden" name="section" value={announcement.section} />
      <input name="title" required defaultValue={announcement.title} className="rounded-md border border-border px-2 py-1 text-sm" />
      <textarea name="body" required rows={3} defaultValue={announcement.body} className="rounded-md border border-border px-2 py-1 text-sm" />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-hover">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-border px-3 py-1 text-xs">
          Cancel
        </button>
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
      <button type="submit" disabled={pending} className="text-xs underline">
        {pending ? "…" : pinned ? "Unpin" : "Pin"}
      </button>
      {state.error ? <span className="ml-1 text-xs text-danger">{state.error}</span> : null}
    </form>
  );
}

export function DeleteAnnouncementButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(deleteAnnouncementAction, {} as AnnouncementFormState);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="text-xs text-danger underline">
        {pending ? "…" : "Delete"}
      </button>
      {state.error ? <span className="ml-1 text-xs text-danger">{state.error}</span> : null}
    </form>
  );
}
