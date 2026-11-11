import type { Metadata } from "next";
import { getServerSession } from "@/modules/auth/session";
import { listSemesters } from "@/modules/academic/semesters";
import { SemesterForm, WindowToggle } from "@/modules/academic/components/semester-form";

export const metadata: Metadata = { title: "Semesters · Admin" };

export const instant = false;

export default async function AdminSemestersPage() {
  const session = await getServerSession();
  const semesters = await listSemesters(session ?? null);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-semibold">Semesters</h1>
      <p className="mt-1 text-sm text-muted">
        One window open at a time is the norm — self-enrollment checks this flag.
      </p>

      <div className="mt-6">
        <SemesterForm />
      </div>

      {semesters.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No semesters yet — create one above.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {semesters.map((s) => (
            <details key={s.id} className="rounded-lg border border-border bg-surface p-4">
              <summary className="cursor-pointer list-none">
                <span className="font-medium">
                  {s.term} {s.academicYear}
                </span>
                <span className="num ml-3 text-sm text-muted">
                  {s.startDate} → {s.endDate}
                </span>
                <span
                  className={`ml-3 rounded-full px-2 py-0.5 text-xs font-medium ${
                    s.enrollmentOpen ? "bg-primary-soft text-primary-hover" : "bg-warn-soft text-warn"
                  }`}
                >
                  {s.enrollmentOpen ? "window open" : "window closed"}
                </span>
                <span className="float-right">
                  <WindowToggle semester={s} />
                </span>
              </summary>
              <div className="mt-4">
                <SemesterForm semester={s} />
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
