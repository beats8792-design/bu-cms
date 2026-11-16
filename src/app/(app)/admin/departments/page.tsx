import type { Metadata } from "next";
import { getServerSession } from "@/modules/auth/session";
import { listDepartments } from "@/modules/academic/departments";
import { DepartmentForm } from "@/modules/academic/components/department-form";
import type { Department } from "@/modules/academic/schema";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Departments · Admin" };

export const instant = false;

export default async function AdminDepartmentsPage() {
  const session = await getServerSession();
  const departments = await listDepartments(session ?? null);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Departments">
        Academic units; courses belong to exactly one.
      </PageHeader>

      <div className="mt-6">
        <DepartmentForm />
      </div>

      {departments.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="No departments yet">
            Add the first department with the form above.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {departments.map((d) => (
            <details key={d.id} className="rounded-lg border border-border bg-surface p-4">
              <summary className="cursor-pointer list-none">
                <Badge tone="info" className="font-mono">
                  {d.code}
                </Badge>
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
