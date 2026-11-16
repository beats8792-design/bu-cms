"use client";

import { useActionState, useRef, useState } from "react";
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
import { Badge, Button, ConfirmButton, Notice, textareaClass } from "@/components/ui";

const EMPTY = {} as AiFormState;

function Banner({ state }: { state: AiFormState }) {
  if (state.error) {
    return <Notice tone="danger">{state.error}</Notice>;
  }
  if (state.info) {
    return <Notice tone="info">{state.info}</Notice>;
  }
  return null;
}

/* ---------------------------------------------------------------- assistant */

export function AskForm({ courseId, secondsLeft }: { courseId: string; secondsLeft: number }) {
  const [state, formAction, pending] = useActionState(askAction, EMPTY);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
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
          className={textareaClass}
        />
      </label>
      <Button type="submit" disabled={pending} aria-busy={pending || undefined} className="self-start">
        {pending ? "Thinking…" : secondsLeft > 0 ? `Wait ${secondsLeft}s` : "Ask"}
      </Button>
      <p role="status" aria-live="polite" className="sr-only">
        {pending ? "Searching course materials and answering…" : ""}
      </p>
    </form>
  );
}

export function ClearThreadButton({ courseId }: { courseId: string }) {
  const [state, formAction, pending] = useActionState(clearThreadAction, EMPTY);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <span className="flex items-center gap-2">
      <form ref={formRef} action={formAction} className="inline">
        <input type="hidden" name="courseId" value={courseId} />
        <ConfirmButton
          confirm="Clear your entire question thread for this course? This cannot be undone."
          onConfirm={() => formRef.current?.requestSubmit()}
          pending={pending}
          busyLabel="Clearing…"
          variant="dangerLink"
          size="sm"
        >
          Clear my thread
        </ConfirmButton>
      </form>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
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
          className="mt-1 w-64 rounded-lg border border-border bg-surface px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
      <label className="text-sm font-medium">
        Questions
        <select name="count" defaultValue="10" className="mt-1 rounded-lg border border-border bg-surface px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-primary">
          {QUIZ_COUNTS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending} aria-busy={pending || undefined} className="self-start">
        {pending ? "Generating…" : "Generate quiz draft"}
      </Button>
      <p role="status" aria-live="polite" className="sr-only">
        {pending ? "Generating the quiz draft…" : ""}
      </p>
      <div className="w-full">
        {state.ok ? <Notice tone="success">Quiz draft generated — review below.</Notice> : null}
        {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
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
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="font-display text-base font-semibold hover:underline"
        >
          {quiz.topic ? quiz.topic : "Mixed topics"} · {quiz.questions.length} questions
        </button>
        <span className="num text-xs text-muted">
          by {quiz.creatorName} · {quiz.createdAt.slice(0, 16).replace("T", " ")}
        </span>
        {canDelete ? (
          <DeleteQuizButton quizId={quiz.id} courseId={quiz.courseId} action={delAction} pending={delPending} error={delState.error} />
        ) : null}
      </div>
      {delState.error ? <Notice tone="danger">{delState.error}</Notice> : null}
      {open ? (
        <div className="mt-3">
          <p className="mb-2">
            <Button variant="outline" size="sm" onClick={() => setReveal(!reveal)} aria-expanded={reveal}>
              {reveal ? "Hide answer key" : "Show answer key"}
            </Button>
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
                      {reveal && oi === q.answerIndex ? " (answer)" : ""}
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

function DeleteQuizButton({
  quizId,
  courseId,
  action,
  pending,
  error,
}: {
  quizId: string;
  courseId: string;
  action: (formData: FormData) => void;
  pending: boolean;
  error?: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <>
      <form ref={formRef} action={action} className="ml-auto inline">
        <input type="hidden" name="id" value={quizId} />
        <input type="hidden" name="courseId" value={courseId} />
        <ConfirmButton
          confirm="Delete this quiz draft?"
          onConfirm={() => formRef.current?.requestSubmit()}
          pending={pending}
          busyLabel="Deleting…"
          variant="dangerLink"
          size="sm"
        >
          Delete
        </ConfirmButton>
      </form>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </>
  );
}

/* ------------------------------------------------------------------ planner */

export function PlanGenerator({ hasPlan }: { hasPlan: boolean }) {
  const [state, formAction, pending] = useActionState(generatePlanAction, EMPTY);
  return (
    <div className="flex flex-col gap-2">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <form action={formAction}>
        <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Planning…" : hasPlan ? "Regenerate this week's plan" : "Build my weekly plan"}
        </Button>
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
                        role="checkbox"
                        aria-checked={item.done}
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
                      <Badge tone="info">{item.courseCode}</Badge>
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
