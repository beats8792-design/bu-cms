import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { appGate } from "@/modules/auth/session";
import { getCourse } from "@/modules/academic/courses";
import { myEnrollment } from "@/modules/academic/enrollment";
import { courseChunkCount } from "@/modules/ai/rag";
import { listQuizzes } from "@/modules/ai/quiz";
import { QuizGenerator, QuizReview } from "@/modules/ai/components/ai-forms";

export const instant = false;

interface Props {
  params: Promise<{ courseId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  return { title: `Quiz drafts · ${courseId.slice(-6)} · UCMS` };
}

export default async function QuizPage({ params }: Props) {
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
  const myRow = user.role === "student" || user.role === "cr" ? await myEnrollment(session, course.id) : null;
  const enrolled = myRow?.status === "enrolled";
  if (!canManage && !enrolled) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-sm text-muted">Quiz drafts are for the course&apos;s members.</p>
        <p className="mt-2">
          <Link href={`/courses/${courseId}`} className="text-sm underline">
            ← Back to course
          </Link>
        </p>
      </div>
    );
  }

  const [quizzes, chunkCount] = await Promise.all([listQuizzes(session, course.id), courseChunkCount(course.id)]);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="font-mono text-xs text-muted">{course.code}</p>
      <h1 className="font-display text-2xl font-semibold">Quiz drafts</h1>
      <p className="mt-1 text-sm text-muted">
        AI-generated MCQ drafts from this course&apos;s materials — review them, answers included.
      </p>

      {chunkCount === 0 ? (
        <p role="status" className="mt-4 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          This course has no indexed material yet — quizzes are grounded in the AI index, so a teacher needs to build it
          first.
        </p>
      ) : (
        <div className="mt-4">
          <QuizGenerator courseId={course.id} />
        </div>
      )}

      {quizzes.length > 0 ? (
        <ul className="mt-6 flex flex-col gap-3">
          {quizzes.map((q) => (
            <QuizReview key={q.id} quiz={q} canDelete={user.role === "admin" || q.createdBy === user.id} />
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-muted">No quiz drafts yet.</p>
      )}

      <p className="mt-8">
        <Link href={`/courses/${courseId}`} className="text-sm underline">
          ← Back to course
        </Link>
      </p>
    </div>
  );
}
