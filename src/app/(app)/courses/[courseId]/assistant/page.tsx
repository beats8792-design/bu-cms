import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { appGate } from "@/modules/auth/session";
import { getCourse } from "@/modules/academic/courses";
import { listThread, quotaState } from "@/modules/ai/assistant";
import { courseChunkCount } from "@/modules/ai/rag";
import { aiConfigured } from "@/modules/ai/gemini";
import { AskForm, ClearThreadButton, MessageList, ReindexButton } from "@/modules/ai/components/ai-forms";

export const instant = false;

interface Props {
  params: Promise<{ courseId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  return { title: `AI Course Assistant · ${courseId.slice(-6)}` };
}

export default async function AssistantPage({ params }: Props) {
  const { courseId } = await params;
  const { user } = await appGate();
  const session = { user };

  let course;
  try {
    course = await getCourse(session, courseId);
  } catch {
    notFound();
  }

  const canManage = user.role === "admin" || course.teacherIds.includes(user.id);
  const enrolled = user.role === "student" || user.role === "cr";
  if (!canManage && !enrolled) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-muted">The AI assistant is for the course&apos;s teachers and enrolled students.</p>
        <p className="mt-2">
          <Link href={`/courses/${courseId}`} className="text-sm underline">
            ← Back to course
          </Link>
        </p>
      </div>
    );
  }

  const [messages, quota, chunkCount] = await Promise.all([
    listThread(session, course.id),
    quotaState(session, course.id),
    courseChunkCount(course.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="font-mono text-xs text-muted">{course.code}</p>
      <h1 className="font-display text-2xl font-semibold">AI Course Assistant</h1>
      <p className="mt-1 text-sm text-muted">
        Answers come from this course&apos;s uploaded materials, with citations. {quota.used}/{quota.quota} questions
        used today (resets midnight Dhaka).
      </p>

      {canManage ? (
        <div className="mt-4">
          <ReindexButton courseId={course.id} chunkCount={chunkCount} />
        </div>
      ) : null}

      {chunkCount === 0 ? (
        <p role="status" className="mt-4 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          {canManage
            ? "No indexed material yet — upload materials with a text layer, then build the AI index above."
            : "This course has no indexed material yet — ask your teacher to build the AI index."}
        </p>
      ) : null}

      {messages.length > 0 ? (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-muted">Conversation</p>
            <ClearThreadButton courseId={course.id} />
          </div>
          <MessageList messages={messages} />
        </div>
      ) : null}

      {aiConfigured() ? (
        <div className="mt-6">
          <AskForm courseId={course.id} secondsLeft={quota.secondsUntilNextAsk} />
        </div>
      ) : (
        <p role="status" className="mt-6 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          AI features are not configured on this deployment yet.
        </p>
      )}

      <p className="mt-8">
        <Link href={`/courses/${courseId}`} className="text-sm underline">
          ← Back to course
        </Link>
      </p>
    </div>
  );
}
