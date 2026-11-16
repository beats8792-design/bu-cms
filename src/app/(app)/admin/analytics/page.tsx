import type { Metadata } from "next";
import Link from "next/link";
import { appGate } from "@/modules/auth/session";
import { listDepartments } from "@/modules/academic/departments";
import { Badge, Button, ButtonLink, inputClass } from "@/components/ui";
import {
  attendanceTrends,
  atRiskStudents,
  assignmentStats,
  dataQuality,
  gradeDistributions,
} from "@/modules/admin/analytics";

export const metadata: Metadata = { title: "Admin · Analytics" };

export const instant = false;

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const { user } = await appGate();
  const session = { user };
  const sp = await searchParams;
  const departmentId = typeof sp.departmentId === "string" ? sp.departmentId : "";

  const [departments, trends, grades, risk, assignments, quality] = await Promise.all([
    listDepartments(session),
    attendanceTrends(session, departmentId || undefined),
    gradeDistributions(session, departmentId || undefined),
    atRiskStudents(session, departmentId || undefined),
    assignmentStats(session, departmentId || undefined),
    dataQuality(session, departmentId || undefined),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-semibold">Analytics & data quality</h1>

      {/* Department filter + report downloads */}
      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <label className="text-sm font-medium">
          Department
          <select name="departmentId" defaultValue={departmentId} className={`${inputClass} w-56`}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="primary">
          Apply
        </Button>
        <ButtonLink href={`/api/admin/reports/at-risk${departmentId ? `?departmentId=${departmentId}` : ""}`} variant="secondary" size="sm">
          At-risk CSV
        </ButtonLink>
      </form>

      {/* Data quality (missing marks, stale sessions, failed extractions) */}
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold">
          Data-quality checks{" "}
          {quality.length > 0 ? <span className="text-warn">({quality.length} issues)</span> : <span className="text-primary-hover">clean</span>}
        </h2>
        {quality.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No issues found for this scope.</p>
        ) : (
          <>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {quality.slice(0, 25).map((q, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-warn/40 bg-warn-soft p-2">
                  <Badge tone="warn">{q.kind}</Badge>
                  <span className="font-medium">{q.courseCode}</span>
                  <span>{q.message}</span>
                  <Link href={`/courses/${q.courseId}`} className="ml-auto text-xs underline">
                    open
                  </Link>
                </li>
              ))}
            </ul>
            {quality.length > 25 ? (
              <p className="mt-2 text-xs text-muted">Showing first 25 of {quality.length}.</p>
            ) : null}
          </>
        )}
      </section>

      {/* At-risk students (UCM-D5) */}
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold">At-risk students ({risk.length})</h2>
        <p className="mt-1 text-xs text-muted">Low attendance (below the course threshold) or failing total (&lt; 40) when marks exist.</p>
        {risk.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nobody flagged in this scope.</p>
        ) : (
          <>
            <table className="mt-2 w-full border-collapse text-sm">
            <caption className="sr-only">Students with low attendance or failing marks</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-3 font-medium">Course</th>
                <th className="py-2 pr-3 font-medium">Student</th>
                <th className="py-2 pr-3 font-medium">Sec</th>
                <th className="py-2 pr-3 font-medium">Attendance</th>
                <th className="py-2 pr-3 font-medium">Total</th>
                <th className="py-2 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {risk.slice(0, 40).map((r, i) => (
                <tr key={`${r.courseId}:${r.userId}:${i}`} className="border-b border-border hover:bg-primary-soft">
                  <td className="py-2 pr-3">{r.courseCode}</td>
                  <td className="py-2 pr-3">
                    {r.name}
                    {r.studentId ? <span className="num ml-2 text-xs text-muted">{r.studentId}</span> : null}
                  </td>
                  <td className="py-2 pr-3">{r.section}</td>
                  <td className="num py-2 pr-3">{r.pct === null ? "—" : `${r.pct}%`}</td>
                  <td className="num py-2 pr-3">{r.total === null ? "no marks" : r.total}</td>
                  <td className="py-2">
                    <span className="flex flex-wrap gap-1">
                      {r.flags.lowAttendance ? (
                        <Badge tone="warn">&lt; {r.threshold}% attendance</Badge>
                      ) : null}
                      {r.flags.failing ? (
                        <Badge tone="danger">failing</Badge>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {risk.length > 40 ? (
            <p className="mt-2 text-xs text-muted">Showing first 40 of {risk.length}.</p>
          ) : null}
          </>
        )}
      </section>

      {/* Attendance trends (UCM-D4) */}
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold">Attendance trends (lowest first)</h2>
        {trends.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No attendance recorded in this scope yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {trends.map((t) => (
              <li key={t.courseId} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2">
                <Link href={`/courses/${t.courseId}`} className="font-medium hover:underline">
                  {t.code}
                </Link>
                <span className="text-muted">{t.title}</span>
                <Badge tone={t.pct !== null && t.pct < 75 ? "warn" : "info"} className="num ml-auto">
                  {t.pct === null ? "no data" : `${t.pct}%`} ({t.attended}/{t.possible})
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Result distributions + GPA (UCM-D5) */}
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold">Result distributions</h2>
        {grades.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No assessment schemas in this scope yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {grades.map((g) => (
              <li key={g.courseId} className="rounded-md border border-border bg-surface p-3">
                <p className="flex flex-wrap items-center gap-2">
                  <Link href={`/courses/${g.courseId}`} className="font-medium hover:underline">
                    {g.code}
                  </Link>
                  <span className="text-muted">{g.title}</span>
                  {!g.published ? <span className="text-xs text-warn">unpublished</span> : null}
                  <span className="num ml-auto text-xs text-muted">
                    {g.graded} graded · avg total {g.averageTotal ?? "—"} · GPA {g.averageGpa ?? "—"}
                  </span>
                </p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {g.distribution.map((d) => (
                    <Badge key={d.letter} tone="info">
                      {d.letter} ×{d.count}
                    </Badge>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Assignment stats (UCM-D6) */}
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold">Assignment submission stats</h2>
        {assignments.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No assignments in this scope yet.</p>
        ) : (
          <table className="mt-2 w-full border-collapse text-sm">
            <caption className="sr-only">Submission rates and late percentages per assignment</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-3 font-medium">Course</th>
                <th className="py-2 pr-3 font-medium">Assignment</th>
                <th className="py-2 pr-3 font-medium">Submitted</th>
                <th className="py-2 pr-3 font-medium">Late</th>
                <th className="py-2 pr-3 font-medium">Graded</th>
                <th className="py-2 font-medium">Rate</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.assignmentId} className="border-b border-border hover:bg-primary-soft">
                  <td className="py-2 pr-3">{a.courseCode}</td>
                  <td className="py-2 pr-3">
                    {a.title} <span className="num text-xs text-muted">{a.points} pts</span>
                  </td>
                  <td className="num py-2 pr-3">
                    {a.submitted}/{a.enrolled}
                  </td>
                  <td className="num py-2 pr-3">{a.late}</td>
                  <td className="num py-2 pr-3">{a.graded}</td>
                  <td className={`num py-2 ${a.rate < 50 ? "text-warn" : ""}`}>{a.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
