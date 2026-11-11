import type { Metadata } from "next";
import { getServerSession } from "@/modules/auth/session";
import { listDepartments } from "@/modules/academic/departments";
import { DepartmentForm } from "@/modules/academic/components/department-form";
import type { Department } from "@/modules/academic/schema";

export const metadata: Metadata = { title: "Departments · Admin" };

export const instant = false;

export default async function AdminDepartmentsPage() {
  const session = await getServerSession();
  const departments = await listDepartments(session ?? null);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-semibold">Departments</h1>
      <p className="mt-1 text-sm text-muted">Academic units; courses belong to exactly one.</p>

      <div className="mt-6">
        <DepartmentForm />
      </div>

      {departments.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No departments yet — add the first one above.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {departments.map((d) => (
            <details key={d.id} className="rounded-lg border border-border bg-surface p-4">
              <summary className="cursor-pointer list-none">
                <span className="rounded bg-primary-soft px-2 py-0.5 font-mono text-xs text-primary-hover">
                  {d.code}
                </span>
                <span className="ml-2 font-medium">{d.name}</span>
                <span className="ml-2 text-sm text-muted">
                  {d.programList.length > 0 ? d.programList.join(" · ") : ""}
                </span>
              </summary>
              <div className="mt-4">
                <DepartmentForm department={d as Department} />
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
