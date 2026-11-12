import type { Metadata } from "next";
import { appGate } from "@/modules/auth/session";
import { listDepartments } from "@/modules/academic/departments";
import { listSemesters } from "@/modules/academic/semesters";
import { listCourses } from "@/modules/academic/courses";
import { listResources } from "@/modules/collab/library";
import { kindLabel, RESOURCE_KINDS, type ResourceKind } from "@/modules/collab/schema";
import { LibraryUploader, ResourceActions } from "@/modules/collab/components/collab-forms";

export const metadata: Metadata = { title: "Library · UCMS" };

export const instant = false;

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function LibraryPage({ searchParams }: Props) {
  const { user } = await appGate();
  const session = { user };
  const sp = await searchParams;
  const query = {
    q: one(sp.q).trim(),
    kind: one(sp.kind),
    departmentId: one(sp.departmentId),
    courseId: one(sp.courseId),
    semesterId: one(sp.semesterId),
  };

  const [resources, departments, courses, semesters] = await Promise.all([
    listResources(session, query),
    listDepartments(session),
    listCourses(session),
    listSemesters(session),
  ]);

  const activeFilters = Object.entries(query).filter(([, v]) => v).length;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-semibold">Resource library</h1>
      <p className="mt-1 text-sm text-muted">
        Past papers, seniors&apos; guides and other shared files — tagged by department, course and
        semester.
      </p>

      {/* Browse + search filters */}
      <form method="get" className="mt-4 grid gap-2 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">
          Search
          <input
            name="q"
            defaultValue={query.q}
            placeholder="e.g. CSE past paper 2024"
            className="mt-1 w-full rounded-md border border-border px-3 py-2"
          />
        </label>
        <label className="text-sm font-medium">
          Kind
          <select name="kind" defaultValue={query.kind} className="mt-1 w-full rounded-md border border-border px-3 py-2">
            <option value="">All kinds</option>
            {RESOURCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k as ResourceKind)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Department
          <select name="departmentId" defaultValue={query.departmentId} className="mt-1 w-full rounded-md border border-border px-3 py-2">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Course
          <select name="courseId" defaultValue={query.courseId} className="mt-1 w-full rounded-md border border-border px-3 py-2">
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Semester
          <select name="semesterId" defaultValue={query.semesterId} className="mt-1 w-full rounded-md border border-border px-3 py-2">
            <option value="">All semesters</option>
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.term} {s.academicYear}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-3 sm:col-span-2">
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
            Apply filters
          </button>
          {activeFilters > 0 ? (
            <a href="/library" className="text-sm underline">
              Clear
            </a>
          ) : null}
        </div>
      </form>

      {/* Upload (every active role — seniors included) */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-primary">Contribute a resource</summary>
        <div className="mt-3">
          <LibraryUploader
            departments={departments.map((d) => ({ id: d.id, code: d.code, name: d.name }))}
            courses={courses.map((c) => ({ id: c.id, code: c.code, title: c.title }))}
            semesters={semesters.map((s) => ({ id: s.id, label: `${s.term} ${s.academicYear}` }))}
          />
        </div>
      </details>

      {/* Results */}
      {resources.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          {activeFilters > 0 ? "No resources match those filters." : "The library is empty — be the first to contribute."}
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {resources.map((r) => {
            const course = courses.find((c) => c.id === r.courseId);
            const department = departments.find((d) => d.id === r.departmentId);
            const semester = semesters.find((s) => s.id === r.semesterId);
            return (
              <li
                key={r.id}
                className={`rounded-lg border border-border bg-surface p-4 ${r.approved ? "" : "border-l-4 border-l-warn"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-hover">
                    {kindLabel(r.kind)}
                  </span>
                  {!r.approved ? <span className="text-xs text-warn">hidden</span> : null}
                  <h2 className="font-display text-base font-semibold">{r.title}</h2>
                </div>
                {r.description ? <p className="mt-1 whitespace-pre-line text-sm">{r.description}</p> : null}
                <p className="num mt-2 text-xs text-muted">
                  {department ? `${department.code} · ` : ""}
                  {course ? `${course.code} · ` : ""}
                  {semester ? `${semester.term} ${semester.academicYear} · ` : ""}
                  by {r.uploaderName} · {r.createdAt.slice(0, 16).replace("T", " ")} ·{" "}
                  {r.downloads} download{r.downloads === 1 ? "" : "s"}
                </p>
                <p className="mt-2 flex items-center gap-3">
                  <a
                    href={`/api/library/${r.id}/download`}
                    className="rounded-md border border-primary px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary-soft"
                  >
                    Download
                  </a>
                  <ResourceActions resource={r} userId={user.id} isAdmin={user.role === "admin"} />
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
