"use client";

import { useState } from "react";
import {
  createCourseAction,
  createEventAction,
  updateCourseAction,
  type FormState,
} from "@/modules/academic/actions";
import { FormAlert, SubmitButton, useAcademicForm } from "@/modules/academic/form-kit";
import { Button, ConfirmButton, Notice, compactInputClass, inputClass, Field } from "@/components/ui";
import {
  DAY_LABELS,
  findScheduleConflicts,
  type Course,
  type Department,
  type ScheduleSlot,
  type Semester,
} from "@/modules/academic/schema";

export function CourseForm({
  course,
  departments,
  semesters,
  teacherScoped,
}: {
  course?: Course;
  departments: Department[];
  semesters: Semester[];
  /** Teacher (not admin): dept/semester are fixed at creation and locked. */
  teacherScoped?: boolean;
}) {
  const editing = Boolean(course);
  const [state, formAction, pending] = useAcademicForm(
    editing ? updateCourseAction : createCourseAction,
  );
  const [showForm, setShowForm] = useState(!editing);
  const [slots, setSlots] = useState<ScheduleSlot[]>(course?.schedule ?? []);

  if (!showForm) {
    return (
      <Button onClick={() => setShowForm(true)} className="self-start">
        Add course
      </Button>
    );
  }

  const conflicts = findScheduleConflicts(slots);

  function addSlot() {
    setSlots((s) => [...s, { day: 0, start: "10:00", end: "11:00", room: "", section: "A" }]);
  }
  function patchSlot(i: number, patch: Partial<ScheduleSlot>) {
    setSlots((s) => s.map((slot, j) => (j === i ? { ...slot, ...patch } : slot)));
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <FormAlert state={state as FormState} />
      {editing ? <input type="hidden" name="id" value={course!.id} /> : null}
      <input type="hidden" name="schedule" value={JSON.stringify(slots)} />
      {conflicts.length > 0 ? (
        <Notice tone="danger">{conflicts[0]}</Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Course code" hint="e.g. CSE-101">
          <input name="code" required defaultValue={course?.code ?? ""} className={inputClass} />
        </Field>
        <Field label="Title">
          <input name="title" required defaultValue={course?.title ?? ""} className={inputClass} />
        </Field>
        <Field label="Credits" hint="0.5–12">
          <input
            name="credits"
            type="number" step="0.5" min="0.5" max="12"
            required
            defaultValue={course?.credits ?? 3}
            className={inputClass}
          />
        </Field>
        <Field label="Type">
          <select name="type" defaultValue={course?.type ?? "core"} className={inputClass}>
            <option value="core">Core</option>
            <option value="elective">Elective</option>
          </select>
        </Field>
        <Field label="Department">
          <select
            name="departmentId"
            required
            defaultValue={course?.departmentId ?? ""}
            disabled={teacherScoped}
            className={inputClass}
          >
            <option value="">Select…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Semester">
          <select
            name="semesterId"
            required
            defaultValue={course?.semesterId ?? ""}
            disabled={teacherScoped}
            className={inputClass}
          >
            <option value="">Select…</option>
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.term} {s.academicYear}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Seat limit">
          <input
            name="seatLimit"
            type="number" min="1" max="1000"
            required
            defaultValue={course?.seatLimit ?? 40}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Syllabus" hint="plain text, shown on the course page">
        <textarea name="syllabus" rows={4} defaultValue={course?.syllabus ?? ""} className={inputClass} />
      </Field>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Weekly class schedule</p>
          <button
            type="button"
            onClick={addSlot}
            disabled={pending}
            className="text-sm text-primary underline disabled:opacity-60"
          >
            + Add slot
          </button>
        </div>
        {slots.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No class slots yet — add one per section meeting.</p>
        ) : null}
        <div className="mt-2 flex flex-col gap-2">
          {slots.map((slot, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
              <select
                value={slot.day}
                onChange={(e) => patchSlot(i, { day: Number(e.target.value) })}
                aria-label="Slot day"
                disabled={pending}
                className={compactInputClass}
              >
                {DAY_LABELS.map((label, day) => (
                  <option key={day} value={day}>{label}</option>
                ))}
              </select>
              <input
                type="time"
                value={slot.start}
                onChange={(e) => patchSlot(i, { start: e.target.value })}
                aria-label="Start time"
                disabled={pending}
                className={compactInputClass}
              />
              <span className="text-muted">–</span>
              <input
                type="time"
                value={slot.end}
                onChange={(e) => patchSlot(i, { end: e.target.value })}
                aria-label="End time"
                disabled={pending}
                className={compactInputClass}
              />
              <input
                placeholder="Room"
                value={slot.room}
                onChange={(e) => patchSlot(i, { room: e.target.value })}
                aria-label="Room"
                disabled={pending}
                className={`w-24 ${compactInputClass}`}
              />
              <input
                placeholder="Sec"
                value={slot.section}
                onChange={(e) => patchSlot(i, { section: e.target.value })}
                aria-label="Section"
                disabled={pending}
                className={`w-16 ${compactInputClass}`}
              />
              <ConfirmButton
                confirm="Remove this class slot from the schedule?"
                onConfirm={() => setSlots((s) => s.filter((_, j) => j !== i))}
                disabled={pending}
                size="sm"
                variant="danger"
              >
                Remove
              </ConfirmButton>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <SubmitButton pending={pending} label={editing ? "Save changes" : "Create course"} />
        {editing ? (
          <ConfirmButton
            confirm="Discard your changes to this course?"
            onConfirm={() => setShowForm(false)}
            variant="secondary"
            size="md"
          >
            Cancel
          </ConfirmButton>
        ) : null}
      </div>
    </form>
  );
}

/** Calendar event form (admin: any scope; teacher: course scope). */
export function EventForm({
  departments,
  courses,
  isAdmin,
}: {
  departments: Department[];
  courses: Course[];
  isAdmin: boolean;
}) {
  const [state, formAction, pending] = useAcademicForm(createEventAction);
  const [scopeType, setScopeType] = useState("university");

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <FormAlert state={state as FormState} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title">
          <input name="title" required className={inputClass} />
        </Field>
        <Field label="Type">
          <select name="type" defaultValue="exam" className={inputClass}>
            <option value="exam">Exam</option>
            <option value="holiday">Holiday</option>
            <option value="notice">Notice</option>
          </select>
        </Field>
        <Field label="Date">
          <input type="date" name="date" required className={inputClass} />
        </Field>
        <Field label="Scope">
          <select
            name="scopeType"
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value)}
            className={inputClass}
          >
            <option value="university">University-wide</option>
            {isAdmin ? <option value="dept">Department</option> : null}
            <option value="course">Course</option>
          </select>
        </Field>
      </div>
      {scopeType === "dept" ? (
        <Field label="Department">
          <select name="refId" required className={inputClass}>
            <option value="">Select…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.code}</option>
            ))}
          </select>
        </Field>
      ) : null}
      {scopeType === "course" ? (
        <Field label="Course">
          <select name="refId" required className={inputClass}>
            <option value="">Select…</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Description" hint="optional">
        <textarea name="description" rows={2} className={inputClass} />
      </Field>
      <SubmitButton pending={pending} label="Add event" />
    </form>
  );
}
