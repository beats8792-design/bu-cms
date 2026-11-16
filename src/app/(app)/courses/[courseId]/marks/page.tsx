import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { appGate } from "@/modules/auth/session";
import { getCourse } from "@/modules/academic/courses";
import { marksGrid, studentResult } from "@/modules/marks/service";
import { SchemaEditor, GridRow, PublishToggle } from "@/modules/marks/components/marks-forms";
import { Notice } from "@/components/ui";

export const instant = false;

interface Props {
  params: Promise<{ courseId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  return { title: `Marks ${courseId.slice(-6)}` };
}

export default async function MarksPage({ params }: Props) {
  const { courseId } = await params;
  const { user } = await appGate();
  const session = { user };

  let course;
  try {
    course = await getCourse(session, courseId);
  } catch {
    notFound();
  }

  const isManager = user.role === "admin" || (user.role === "teacher" && course.teacherIds.includes(user.id));

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-sm text-muted">
        <Link href={`/courses/${courseId}`} className="hover:underline">
          {course.code} — {course.title}
        </Link>{" "}
        / marks &amp; results
      </p>
      <h1 className="font-display text-2xl font-semibold">Marks &amp; results</h1>

      {isManager ? <ManagerView courseId={courseId} /> : <StudentView courseId={courseId} />}
    </div>
  );
}

/** Teacher/admin: assessment plan editor + spreadsheet grid + publish (UCM-F18/19/25). */
async function ManagerView({ courseId }: { courseId: string }) {
  const { user } = await appGate();
  const session = { user };
  const grid = await marksGrid(session, courseId);

  if (grid.schema.components.length === 0) {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <p className="text-sm text-muted">
          No assessment plan yet — set up components (weights must sum to exactly 100) before entering marks.
        </p>
        <SchemaEditor courseId={courseId} components={[]} lockedKeys={[]} />
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      <section>
        <h2 className="font-display text-xl font-semibold">Assessment plan</h2>
        <p className="mt-1 text-xs text-muted">
          Keys holding marks are locked (renaming would orphan them). Clear marks to change them.
        </p>
        <div className="mt-2">
          <SchemaEditor
            courseId={courseId}
            components={grid.schema.components}
            lockedKeys={[...new Set(grid.audit.map((a) => a.componentKey))]}
          />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold">
            Marks grid ({grid.rows.length} students)
            {grid.schema.published ? (
              <span className="ml-3 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-hover">
                Published {grid.schema.publishedAt?.slice(0, 10)}
              </span>
            ) : (
              <span className="ml-3 rounded-full bg-warn-soft px-3 py-1 text-xs font-medium text-warn">
                Draft — students can&apos;t see anything yet
              </span>
            )}
          </h2>
          <PublishToggle courseId={courseId} published={grid.schema.published} />
        </div>
        {grid.rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No students enrolled yet.</p>
        ) : (
          <table className="mt-4 w-full border-collapse text-sm">
            <caption className="sr-only">Marks per student</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-3 font-medium">Student</th>
                <th className="py-2 pr-3 font-medium">Sec</th>
                {grid.schema.components.map((c) => (
                  <th key={c.key} className="py-2 pr-3 font-medium">
                    {c.name}
                  </th>
                ))}
                <th className="py-2 pr-3 font-medium">Total</th>
                <th className="py-2 pr-3 font-medium">Grade</th>
                <th className="py-2 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((r) => (
                <GridRow
                  key={r.userId}
                  courseId={courseId}
                  row={r}
                  components={grid.schema.components}
                  published={grid.schema.published}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>

      {grid.audit.length > 0 ? (
        <section>
          <h2 className="font-display text-xl font-semibold">Audit trail (latest first)</h2>
          <ul className="mt-2 flex flex-col gap-1 text-xs">
            {grid.audit.slice(0, 20).map((a, i) => (
              <li key={i} className="num rounded-md border border-border bg-surface px-3 py-1">
                {a.at.slice(0, 16).replace("T", " ")} — {a.userName} · {a.componentKey} → {a.score}
                {a.override ? " (admin override)" : ""}
                {a.reason ? ` — “${a.reason}”` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Student/CR: published result with per-component comparison (UCM-F22/F24). */
async function StudentView({ courseId }: { courseId: string }) {
  const { user } = await appGate();
  const session = { user };
  let result;
  try {
    result = await studentResult(session, courseId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Results are not available yet.";
    return (
      <div className="mt-6">
        <Notice tone="info">{message}</Notice>
      </div>
    );
  }

  if (result.schema.components.length === 0) {
    return (
      <p className="mt-6 text-sm text-muted">
        No assessment plan has been set up for this course yet.
      </p>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="num rounded-full bg-primary-soft px-4 py-1 text-sm font-medium text-primary-hover">
          Total {result.total}
        </span>
        <span className="num rounded-full bg-primary-soft px-4 py-1 text-sm font-medium text-primary-hover">
          Grade {result.grade} ({result.gradePoint.toFixed(2)})
        </span>
        <span className="text-xs text-muted">published {result.schema.publishedAt?.slice(0, 10)}</span>
      </div>

      <section>
        <h2 className="font-display text-xl font-semibold">Component breakdown</h2>
        <ul className="mt-2 flex flex-col gap-3 text-sm">
          {result.schema.components.map((c) => {
            const myPct = result.mine[c.key];
            const avgPct = result.averages[c.key];
            return (
              <li key={c.key}>
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="num text-muted">
                    {result.scores[c.key] ?? "—"} / {c.maxMarks} · weight {c.weight}%
                  </span>
                </p>
                <div className="mt-1 flex flex-col gap-1" aria-hidden>
                  <Bar pct={myPct} cls="bg-primary" />
                  <Bar pct={avgPct} cls="bg-primary-hover opacity-40" />
                </div>
                <p className="num mt-1 text-xs text-muted">
                  You {myPct === null || myPct === undefined ? "—" : `${myPct}%`} · class avg{" "}
                  {avgPct === null || avgPct === undefined ? "—" : `${avgPct}%`} of max marks
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Bar({ pct, cls }: { pct: number | null | undefined; cls: string }) {
  const width = pct === null || pct === undefined ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 w-full max-w-md overflow-hidden rounded bg-primary-soft">
      <div className={`h-full rounded ${cls}`} style={{ width: `${width}%` }} />
    </div>
  );
}
