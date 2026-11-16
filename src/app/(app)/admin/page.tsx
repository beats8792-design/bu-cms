import type { Metadata } from "next";
import Link from "next/link";
import { appGate } from "@/modules/auth/session";
import { institutionCounts, departmentHealth } from "@/modules/admin/analytics";
import { recentActivities } from "@/modules/admin/activity";

export const metadata: Metadata = { title: "Admin dashboard" };

export const instant = false;

export default async function AdminPage() {
  const { user } = await appGate();
  const session = { user };
  const [counts, health, activity] = await Promise.all([
    institutionCounts(session),
    departmentHealth(session),
    recentActivities(session, 8),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-2xl font-semibold">Admin console</h1>

      {/* Institution counts (UCM-D1) */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Total accounts" value={Object.values(counts.usersByRole).reduce((a, b) => a + b, 0)} />
        <Stat label="Pending approval" value={counts.pending} warn={counts.pending > 0} />
        <Stat label="Suspended" value={counts.suspended} warn={counts.suspended > 0} />
        <Stat label="Students + CRs" value={(counts.usersByRole.student ?? 0) + (counts.usersByRole.cr ?? 0)} />
        <Stat label="Teachers" value={counts.usersByRole.teacher ?? 0} />
        <Stat label="Alumni" value={counts.usersByRole.alumni ?? 0} />
        <Stat label="Courses" value={counts.courses} />
        <Stat label="Departments" value={counts.departments} />
        <Stat label="Active enrollments" value={counts.activeEnrollments} />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/admin/users" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-primary-hover">
          Manage users
        </Link>
        <Link href="/admin/analytics" className="inline-flex h-10 items-center rounded-md border border-primary bg-surface px-4 text-sm font-medium text-primary transition-colors duration-150 hover:bg-primary-soft">
          Analytics &amp; data quality
        </Link>
        <Link href="/admin/logs" className="inline-flex h-10 items-center rounded-md border border-border bg-surface px-4 text-sm transition-colors duration-150 hover:bg-primary-soft">
          Activity log
        </Link>
      </div>

      {/* Department health (UCM-D1) */}
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold">Department health</h2>
        {health.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No departments yet.</p>
        ) : (
          <table className="mt-2 w-full border-collapse text-sm">
            <caption className="sr-only">Departments with people, courses and seat fill</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-3 font-medium">Department</th>
                <th className="py-2 pr-3 font-medium">Teachers</th>
                <th className="py-2 pr-3 font-medium">Students</th>
                <th className="py-2 pr-3 font-medium">Courses</th>
                <th className="py-2 pr-3 font-medium">Seats filled</th>
                <th className="py-2 font-medium">Fill %</th>
              </tr>
            </thead>
            <tbody>
              {health.map((d) => (
                <tr key={d.id} className="border-b border-border hover:bg-primary-soft">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{d.code}</span> <span className="text-muted">{d.name}</span>
                  </td>
                  <td className="num py-2 pr-3">{d.teachers}</td>
                  <td className="num py-2 pr-3">{d.students}</td>
                  <td className="num py-2 pr-3">{d.courses}</td>
                  <td className="num py-2 pr-3">
                    {d.enrolled}/{d.seats}
                  </td>
                  <td className="num py-2">{d.fill}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Recent activity (UCM-D7) */}
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold">Recent activity</h2>
        {activity.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing logged yet — actions appear as admins and teachers work.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2">
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-hover">
                  {a.action}
                </span>
                <span>{a.actorName}</span>
                <span className="text-muted">→ {a.target}</span>
                <span className="num ml-auto text-xs text-muted">{a.createdAt.slice(0, 16).replace("T", " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`num font-display text-2xl font-semibold ${warn ? "text-warn" : ""}`}>{value}</p>
    </div>
  );
}
