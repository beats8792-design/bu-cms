import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { appGate } from "@/modules/auth/session";
import { getCourse } from "@/modules/academic/courses";
import { listMaterials } from "@/modules/materials/service";
import { myEnrollment } from "@/modules/academic/enrollment";
import { getSummary } from "@/modules/ai/summarizer";
import { SummaryButton } from "@/modules/ai/components/ai-forms";

export const instant = false;

interface Props {
  params: Promise<{ courseId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  return { title: `AI summaries · ${courseId.slice(-6)} · UCMS` };
}

export default async function SummariesPage({ params }: Props) {
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
        <p className="text-sm text-muted">AI summaries are for the course&apos;s members.</p>
        <p className="mt-2">
          <Link href={`/courses/${courseId}`} className="text-sm underline">
            ← Back to course
          </Link>
        </p>
      </div>
    );
  }

  const materials = (await listMaterials(session, course.id)).filter((m) => m.extraction.status === "ok");
  const summaries = await Promise.all(materials.map((m) => getSummary(session, m.id)));

  return (
    <div className="mx-auto max-w-2xl">
      <p className="font-mono text-xs text-muted">{course.code}</p>
      <h1 className="font-display text-2xl font-semibold">AI summaries</h1>
      <p className="mt-1 text-sm text-muted">
        Structured study notes per material — key points, definitions, formulas and practice questions.
      </p>

      {materials.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          No materials with a text layer yet — summaries appear once readable PDFs/DOCX/PPTX are uploaded.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {materials.map((m, i) => {
            const s = summaries[i];
            return (
              <li key={m.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-base font-semibold">{m.title}</h2>
                  <span className="text-xs uppercase text-muted">.{m.fileType}</span>
                  <span className="ml-auto">
                    <SummaryButton materialId={m.id} courseId={course.id} hasSummary={Boolean(s)} />
                  </span>
                </div>
                {s ? (
                  <div className="mt-3 flex flex-col gap-3 text-sm">
                    <p>{s.overview}</p>
                    <div>
                      <p className="text-xs font-semibold text-muted">Key points</p>
                      <ul className="mt-1 ml-4 list-disc">
                        {s.keyPoints.map((k, ki) => (
                          <li key={ki}>{k}</li>
                        ))}
                      </ul>
                    </div>
                    {s.definitions.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-muted">Definitions</p>
                        <dl className="mt-1 flex flex-col gap-1">
                          {s.definitions.map((d, di) => (
                            <div key={di}>
                              <dt className="font-medium">{d.term}</dt>
                              <dd className="text-muted">{d.meaning}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ) : null}
                    {s.formulas.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-muted">Formulas</p>
                        <ul className="num mt-1 ml-4 list-disc">
                          {s.formulas.map((f, fi) => (
                            <li key={fi}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {s.studyQuestions.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-muted">Study questions</p>
                        <ol className="mt-1 ml-4 list-decimal">
                          {s.studyQuestions.map((q, qi) => (
                            <li key={qi}>{q}</li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                    <p className="num text-xs text-muted">generated {s.createdAt.slice(0, 16).replace("T", " ")}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">No summary generated yet.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-8">
        <Link href={`/courses/${courseId}`} className="text-sm underline">
          ← Back to course
        </Link>
      </p>
    </div>
  );
}
