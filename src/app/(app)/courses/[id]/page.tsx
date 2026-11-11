import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { appGate } from "@/modules/auth/session";
import { getCourse, teacherNamesByIds } from "@/modules/academic/courses";
import { listDepartments } from "@/modules/academic/departments";
import { getOpenSemester, listSemesters } from "@/modules/academic/semesters";
import { courseRoster, myEnrollment } from "@/modules/academic/enrollment";
import { listUsers } from "@/modules/admin/users";
import { formatSlot, type Department, type Semester } from "@/modules/academic/schema";
import { CourseForm } from "@/modules/academic/components/course-form";
import { TeacherPicker } from "@/modules/academic/components/teacher-picker";
import { DropButton, EnrollButton, ManualEnrollForm } from "@/modules/academic/components/enroll-buttons";
import { listMaterials } from "@/modules/materials/service";
import { formatBytes } from "@/modules/materials/schema";
import { MaterialUploader, MaterialVisibilityToggle } from "@/modules/materials/components/material-uploader";

export const instant = false;

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Course ${id.slice(-6)} · UCMS` };
}

export default async function CoursePage({ params }: Props) {
  const { id } = await params;
  const { user } = await appGate();
  const session = { user };

  let course;
  try {
    course = await getCourse(session, id);
  } catch {
    notFound();
  }

  const isAdmin = user.role === "admin";
  const isTeacherOfCourse = user.role === "teacher" && course.teacherIds.includes(user.id);
  const isCr = user.role === "cr";
  const isStudent = user.role === "student";

  const [semester, departments] = (await Promise.all([
    listSemesters(session).then((all) => all.find((s) => s.id === course.semesterId) ?? null),
    listDepartments(session),
  ])) as [Semester | null, Department[]];
  const department = departments.find((d) => d.id === course.departmentId) ?? null;
  const teacherNames = await teacherNamesByIds(course.teacherIds);

  const myRow =
    isStudent || isCr ? await myEnrollment(session, course.id) : null;
  const openSemester = await getOpenSemester(session);
  const windowOpen = openSemester?.id === course.semesterId && Boolean(openSemester?.enrollmentOpen);

  const canManage = isAdmin || isTeacherOfCourse;
  const canSeeRoster = canManage || isCr;
  const roster = canSeeRoster ? await courseRoster(session, course.id) : [];
  const materials = await listMaterials(session, course.id, { includeHidden: true });
  const materialsByTopicKey = new Map<string, typeof materials>();
  for (const m of materials) {
    const list = materialsByTopicKey.get(m.topic) ?? [];
    list.push(m);
    materialsByTopicKey.set(m.topic, list);
  }

  const teachers = isAdmin
    ? (await listUsers(session, { role: "teacher" })).users.map((t) => ({
        id: t.id,
        name: t.name,
        email: t.email,
      }))
    : [];

  return (
    <div className="mx-auto max-w-3xl">
      <p className="font-mono text-xs text-muted">
        {course.code} · {course.type} · {course.credits} credits
        {department ? ` · ${department.code}` : ""}
      </p>
      <h1 className="font-display text-2xl font-semibold">{course.title}</h1>
      <p className="mt-1 text-sm text-muted">
        {semester ? `${semester.term} ${semester.academicYear}` : "Unknown semester"} ·{" "}
        {course.teacherIds.length > 0
          ? course.teacherIds.map((t) => teacherNames.get(t) ?? "Teacher").join(", ")
          : "No teacher assigned yet"}
      </p>

      {/* Self-service enrollment (students + CR) */}
      {(isStudent || isCr) && myRow?.status !== "enrolled" ? (
        <div className="mt-4">
          <EnrollButton courseId={course.id} disabled={!windowOpen} />
          {!windowOpen ? (
            <p className="mt-1 text-sm text-muted">Enrollment is closed for this semester.</p>
          ) : null}
        </div>
      ) : null}
      {myRow?.status === "enrolled" ? (
        <div className="mt-4 flex items-center gap-3">
          <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-hover">
            Enrolled · section {myRow.section}
          </span>
          <DropButton courseId={course.id} small />
        </div>
      ) : null}

      {/* Schedule */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">Class schedule</h2>
        {course.schedule.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No class slots set yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {course.schedule.map((s, i) => (
              <li key={i} className="num">
                {DAY(s.day)} · {formatSlot(s)} · section {s.section}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Materials (UCM-F8) */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">Materials</h2>
        {materials.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            {canManage ? "No materials yet — upload the first file below." : "No materials yet."}
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-4">
            {[...materialsByTopicKey.entries()].map(([topic, list]) => (
              <div key={topic}>
                <p className="text-sm font-semibold text-muted">{topic}</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {list.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2 text-sm"
                    >
                      <a href={`/api/materials/${m.id}/download`} className="font-medium hover:underline">
                        {m.title}
                      </a>
                      <span className="text-xs uppercase text-muted">.{m.fileType}</span>
                      <span className="num text-xs text-muted">{formatBytes(m.size)}</span>
                      <span className="num text-xs text-muted">
                        {m.downloadCount} download{m.downloadCount === 1 ? "" : "s"}
                      </span>
                      {m.hidden ? <span className="text-xs text-warn">hidden</span> : null}
                      {m.extraction.status !== "ok" && canManage ? (
                        <span className="text-xs text-warn">{m.extraction.message}</span>
                      ) : null}
                      {canManage ? (
                        <span className="ml-auto">
                          <MaterialVisibilityToggle materialId={m.id} hidden={m.hidden} />
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {canManage ? (
          <div className="mt-4">
            <MaterialUploader courseId={course.id} />
          </div>
        ) : null}
      </section>

      {/* Syllabus */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">Syllabus</h2>
        {course.syllabus ? (
          <p className="mt-2 whitespace-pre-line text-sm">{course.syllabus}</p>
        ) : (
          <p className="mt-2 text-sm text-muted">No syllabus added yet.</p>
        )}
      </section>

      {/* Roster (teacher/admin/CR) */}
      {canSeeRoster ? (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold">
            Roster ({roster.length}/{course.seatLimit})
          </h2>
          {roster.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No students enrolled yet.</p>
          ) : (
            <table className="mt-2 w-full border-collapse text-sm">
              <caption className="sr-only">Enrolled students</caption>
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="py-2 pr-3 font-medium">Student</th>
                  <th className="py-2 pr-3 font-medium">ID</th>
                  <th className="py-2 pr-3 font-medium">Section</th>
                  {canManage ? <th className="py-2 font-medium sr-only">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {roster.map((r) => (
                  <tr key={r.userId} className="border-b border-border hover:bg-primary-soft">
                    <td className="py-2 pr-3">{r.name}</td>
                    <td className="num py-2 pr-3 text-muted">{r.studentId || "—"}</td>
                    <td className="py-2 pr-3">{r.section}</td>
                    {canManage ? (
                      <td className="py-2 text-right">
                        <DropButton courseId={course.id} userId={r.userId} small />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {/* Management: manual enroll, edit course, assign teachers */}
      {canManage ? (
        <section className="mt-10 flex flex-col gap-6">
          <h2 className="font-display text-lg font-semibold">Manage course</h2>
          <ManualEnrollForm courseId={course.id} />
          <CourseForm
            course={course}
            departments={departments}
            semesters={await listSemesters(session)}
            teacherScoped={isTeacherOfCourse}
          />
          {isAdmin ? <TeacherPicker courseId={course.id} teachers={teachers} assigned={course.teacherIds} /> : null}
        </section>
      ) : null}
    </div>
  );
}

function DAY(day: number): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] ?? "";
}
