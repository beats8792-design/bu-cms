"use client";

import { useActionState, useState } from "react";
import {
  askAction,
  clearThreadAction,
  deleteQuizAction,
  generatePlanAction,
  generateQuizAction,
  generateSummaryAction,
  reindexCourseAction,
  togglePlanItemAction,
  type AiFormState,
} from "@/modules/ai/actions";
import { QUIZ_COUNTS, WEEKDAY, type AssistantMessage, type QuizDraft, type StudyPlan } from "@/modules/ai/schema";

const EMPTY = {} as AiFormState;

function Banner({ state }: { state: AiFormState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.info) {
    return <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-hover">{state.info}</p>;
  }
  return null;
}

const BTN = "rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60";

/* ---------------------------------------------------------------- assistant */

export function AskForm({ courseId, secondsLeft }: { courseId: string; secondsLeft: number }) {
  const [state, formAction, pending] = useActionState(askAction, EMPTY);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      {state.error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      <input type="hidden" name="courseId" value={courseId} />
      <label className="text-sm font-medium">
        Ask about this course&apos;s materials
        <textarea
          name="question"
          rows={2}
          required
          minLength={5}
          maxLength={1000}
          disabled={pending}
          placeholder="e.g. Explain the difference between… / What topics should I revise for the quiz?"
          className="mt-1 w-full rounded-md border border-border px-3 py-2"
        />
      </label>
      <button type="submit" disabled={pending} className={`self-start ${BTN}`}>
        {pending ? "Thinking…" : secondsLeft > 0 ? `Wait ${secondsLeft}s` : "Ask"}
      </button>
      <p role="status" aria-live="polite" className="sr-only">
        {pending ? "Searching course materials and answering…" : ""}
      </p>
    </form>
  );
}

export function ClearThreadButton({ courseId }: { courseId: string }) {
  const [state, formAction, pending] = useActionState(clearThreadAction, EMPTY);
  return (
    <span className="flex items-center gap-2">
      <form action={formAction} className="inline">
        <input type="hidden" name="courseId" value={courseId} />
        <button type="submit" disabled={pending} className="text-xs text-danger underline">
          {pending ? "…" : "Clear my thread"}
        </button>
      </form>
      {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
    </span>
  );
}

export function MessageList({ messages }: { messages: AssistantMessage[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {messages.map((m) => (
        <li
          key={m.id}
          className={`rounded-lg border p-3 text-sm ${
            m.role === "user" ? "border-border bg-surface" : "border-primary/30 bg-primary-soft"
          }`}
        >
          <p className={`text-xs font-medium ${m.role === "user" ? "text-muted" : "text-primary-hover"}`}>
            {m.role === "user" ? "You" : "Course tutor"}
          </p>
          <p className="mt-1 whitespace-pre-line">{m.content}</p>
          {m.citations.length > 0 ? (
            <p className="mt-2 text-xs text-muted">
              Sources:{" "}
              {m.citations
                .filter((c, i, all) => all.findIndex((x) => x.materialId === c.materialId) === i)
                .map((c) => c.title)
                .join(" · ")}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------- summarizer */

export function SummaryButton({
  materialId,
  courseId,
  hasSummary,
}: {
  materialId: string;
  courseId: string;
  hasSummary: boolean;
}) {
  const [state, formAction, pending] = useActionState(generateSummaryAction, EMPTY);
  return (
    <span className="flex flex-col gap-1">
      <form action={formAction} className="inline">
        <input type="hidden" name="materialId" value={materialId} />
        <input type="hidden" name="courseId" value={courseId} />
        <button type="submit" disabled={pending} className="text-xs underline">
          {pending ? "Summarizing…" : hasSummary ? "Regenerate summary" : "Generate AI summary"}
        </button>
      </form>
      <p role="status" aria-live="polite" className="sr-only">
        {pending ? "Summarizing the material…" : ""}
      </p>
      {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
    </span>
  );
}

/* -------------------------------------------------------------------- quiz */

export function QuizGenerator({ courseId }: { courseId: string }) {
  const [state, formAction, pending] = useActionState(generateQuizAction, EMPTY);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
      <input type="hidden" name="courseId" value={courseId} />
      <label className="text-sm font-medium">
        Topic <span className="text-muted">(optional)</span>
        <input
          name="topic"
          maxLength={120}
          placeholder="e.g. Recursion, Chapter 4…"
          className="mt-1 w-64 rounded-md border border-border px-3 py-2"
        />
      </label>
      <label className="text-sm font-medium">
        Questions
        <select name="count" defaultValue="10" className="mt-1 rounded-md border border-border px-3 py-2">
          {QUIZ_COUNTS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className={BTN}>
        {pending ? "Generating…" : "Generate quiz draft"}
      </button>
      <p role="status" aria-live="polite" className="sr-only">
        {pending ? "Generating the quiz draft…" : ""}
      </p>
      <div className="w-full">
        {state.ok ? <p className="rounded-md bg-primary-soft px-3 py-2 text-sm text-primary-hover">Quiz draft generated — review below.</p> : null}
        {state.error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      </div>
    </form>
  );
}

export function QuizReview({ quiz, canDelete }: { quiz: QuizDraft; canDelete: boolean }) {
  const [open, setOpen] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [delState, delAction, delPending] = useActionState(deleteQuizAction, EMPTY);
  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen(!open)} className="font-display text-base font-semibold hover:underline">
          {open ? "▾" : "▸"} {quiz.topic ? quiz.topic : "Mixed topics"} · {quiz.questions.length} questions
        </button>
        <span className="num text-xs text-muted">
          by {quiz.creatorName} · {quiz.createdAt.slice(0, 16).replace("T", " ")}
        </span>
        {canDelete ? (
          <form action={delAction} className="ml-auto inline">
            <input type="hidden" name="id" value={quiz.id} />
            <input type="hidden" name="courseId" value={quiz.courseId} />
            <button type="submit" disabled={delPending} className="text-xs text-danger underline">
              {delPending ? "…" : "Delete"}
            </button>
          </form>
        ) : null}
      </div>
      {delState.error ? <p className="mt-1 text-xs text-danger">{delState.error}</p> : null}
      {open ? (
        <div className="mt-3">
          <p className="mb-2">
            <button type="button" onClick={() => setReveal(!reveal)} className="rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary-soft">
              {reveal ? "Hide answer key" : "Show answer key"}
            </button>
          </p>
          <ol className="flex flex-col gap-3">
            {quiz.questions.map((q, i) => (
              <li key={i} className="text-sm">
                <p className="font-medium">
                  {i + 1}. {q.question}
                </p>
                <ul className="mt-1 ml-4 list-disc">
                  {q.options.map((opt, oi) => (
                    <li key={oi} className={reveal && oi === q.answerIndex ? "font-semibold text-primary-hover" : ""}>
                      {String.fromCharCode(65 + oi)}. {opt}
                      {reveal && oi === q.answerIndex ? " ✓" : ""}
                    </li>
                  ))}
                </ul>
                {reveal && q.explanation ? <p className="mt-1 text-xs text-muted">{q.explanation}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ planner */

export function PlanGenerator({ hasPlan }: { hasPlan: boolean }) {
  const [state, formAction, pending] = useActionState(generatePlanAction, EMPTY);
  return (
    <div className="flex flex-col gap-2">
      {state.error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      <form action={formAction}>
        <button type="submit" disabled={pending} className={BTN}>
          {pending ? "Planning…" : hasPlan ? "Regenerate this week's plan" : "Build my weekly plan"}
        </button>
      </form>
      {pending ? (
        <p role="status" aria-live="polite" className="text-xs text-muted">
          Reading your deadlines, exams and recent topics…
        </p>
      ) : null}
    </div>
  );
}

export function PlanBoard({ plan }: { plan: StudyPlan }) {
  const [state, formAction, pending] = useActionState(togglePlanItemAction, EMPTY);
  const byDay = new Map<number, StudyPlan["items"]>();
  for (const item of plan.items) {
    const list = byDay.get(item.weekday) ?? [];
    list.push(item);
    byDay.set(item.weekday, list);
  }
  const doneCount = plan.items.filter((i) => i.done).length;

  return (
    <div className="flex flex-col gap-2">
      {state.error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p> : null}
      {plan.summary ? <p className="text-sm text-muted">{plan.summary}</p> : null}
      <p className="num text-xs text-muted">
        {doneCount}/{plan.items.length} done
      </p>
      <ul className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4, 5, 6]
          .filter((d) => byDay.has(d))
          .map((day) => (
            <li key={day}>
              <p className="text-sm font-semibold text-primary-hover">{WEEKDAY(day)}</p>
              <ul className="mt-1 flex flex-col gap-1">
                {byDay.get(day)!.map((item) => (
                  <li
                    key={item.id}
                    className={`flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2 text-sm ${item.done ? "opacity-60" : ""}`}
                  >
                    <form action={formAction} className="inline">
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="done" value={item.done ? "false" : "true"} />
                      <button
                        type="submit"
                        disabled={pending}
                        aria-label={item.done ? "Mark not done" : "Mark done"}
                        className={`flex h-5 w-5 items-center justify-center rounded border ${
                          item.done ? "border-primary bg-primary text-white" : "border-border"
                        }`}
                      >
                        {item.done ? "✓" : ""}
                      </button>
                    </form>
                    <span className={item.done ? "line-through" : ""}>{item.title}</span>
                    {item.courseCode ? (
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-hover">
                        {item.courseCode}
                      </span>
                    ) : null}
                    <span className="num ml-auto text-xs text-muted">{item.minutes} min</span>
                    {item.focus ? <p className="w-full pl-7 text-xs text-muted">{item.focus}</p> : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------- AI index */

export function ReindexButton({ courseId, chunkCount }: { courseId: string; chunkCount: number }) {
  const [state, formAction, pending] = useActionState(reindexCourseAction, EMPTY);
  return (
    <span className="flex flex-col gap-1">
      <form action={formAction} className="inline">
        <input type="hidden" name="courseId" value={courseId} />
        <button type="submit" disabled={pending} className="rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary-soft">
          {pending ? "Indexing…" : chunkCount > 0 ? `Rebuild AI index (${chunkCount} chunks)` : "Build AI index"}
        </button>
      </form>
      <Banner state={state} />
    </span>
  );
}
