import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "@/modules/auth/session";
import { listCourses, countEnrolled, teacherNamesByIds } from "@/modules/academic/courses";
import { listDepartments } from "@/modules/academic/departments";
import { listSemesters } from "@/modules/academic/semesters";
import { CourseForm } from "@/modules/academic/components/course-form";

export const metadata: Metadata = { title: "Courses · Admin" };

export const instant = false;

export default async function AdminCoursesPage() {
  const session = await getServerSession();
  const [departments, semesters, courses] = await Promise.all([
    listDepartments(session ?? null),
    listSemesters(session ?? null),
    listCourses(session ?? null),
  ]);
  const seats = await countEnrolled(courses.map((c) => c.id));
  const teacherNames = await teacherNamesByIds([...new Set(courses.flatMap((c) => c.teacherIds))]);
  const deptById = new Map(departments.map((d) => [d.id, d]));
  const semById = new Map(semesters.map((s) => [s.id, s]));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-semibold">Courses</h1>
      <p className="mt-1 text-sm text-muted">
        Catalog across all semesters. Assign teachers via each course&apos;s detail page.
      </p>

      <div className="mt-6">
        <CourseForm departments={departments} semesters={semesters} />
      </div>

      {courses.length === 0 ? (
        <p className="mt-8 text-sm text-muted">No courses yet.</p>
      ) : (
        <table className="mt-6 w-full border-collapse text-sm">
          <caption className="sr-only">All courses</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-2 pr-3 font-medium">Code</th>
              <th className="py-2 pr-3 font-medium">Title</th>
              <th className="py-2 pr-3 font-medium">Semester</th>
              <th className="py-2 pr-3 font-medium">Dept</th>
              <th className="py-2 pr-3 font-medium">Seats</th>
              <th className="py-2 pr-3 font-medium">Teachers</th>
              <th className="py-2 font-medium sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => {
              const enrolled = seats.get(c.id) ?? 0;
              return (
                <tr key={c.id} className="border-b border-border hover:bg-primary-soft">
                  <td className="py-2 pr-3 font-mono text-xs">{c.code}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/courses/${c.id}`} className="hover:underline">
                      {c.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-muted">
                    {semById.get(c.semesterId)?.term ?? "?"} {semById.get(c.semesterId)?.academicYear ?? ""}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-muted">{deptById.get(c.departmentId)?.code ?? "?"}</td>
                  <td className="num py-2 pr-3">
                    {enrolled}/{c.seatLimit}
                  </td>
                  <td className="py-2 pr-3 text-muted">
                    {c.teacherIds.map((t) => teacherNames.get(t) ?? "?").join(", ") || "—"}
                  </td>
                  <td className="py-2 text-right">
                    <Link href={`/courses/${c.id}`} className="text-primary underline">
                      Manage
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

