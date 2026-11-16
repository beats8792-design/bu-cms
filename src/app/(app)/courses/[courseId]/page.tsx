import type { Metadata } from "next";
import Link from "next/link";
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
import { ModalButton } from "@/components/ui";
import { listMaterials } from "@/modules/materials/service";
import { formatBytes } from "@/modules/materials/schema";
import { MaterialUploader, MaterialVisibilityToggle } from "@/modules/materials/components/material-uploader";
import { listAssignmentsByCourse } from "@/modules/assignments/service";
import { deadlineState, formatDeadline } from "@/modules/assignments/schema";
import { AssignmentForm, DeleteAssignmentButton } from "@/modules/assignments/components/assignment-form";
import { courseDigest, listSessions, myAttendance } from "@/modules/attendance/service";
import { dhakaToday, lowAttendanceMessage } from "@/modules/attendance/schema";
import {
  OpenSessionForm,
  ThresholdForm,
} from "@/modules/attendance/components/attendance-forms";
import { listNotes } from "@/modules/collab/notes";
import { NoteActions, NoteUploader } from "@/modules/collab/components/collab-forms";

export const instant = false;

interface Props {
  params: Promise<{ courseId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  return { title: `Course ${courseId.slice(-6)} · UCMS` };
}

export default async function CoursePage({ params }: Props) {
  const { courseId: id } = await params;
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
  const assignments =
    canManage || myRow?.status === "enrolled" || user.role === "alumni"
      ? await listAssignmentsByCourse(session, course.id)
      : [];

  const rosterSections = [...new Set(roster.map((r) => r.section))];
  const isStudentishEnrolled = (isStudent || isCr) && myRow?.status === "enrolled";
  const notes = canManage || isStudentishEnrolled ? await listNotes(session, course.id) : [];

  const teachers = isAdmin
    ? (await listUsers(session, { role: "teacher" })).users.map((t) => ({
        id: t.id,
        name: t.name,
        email: t.email,
      }))
    : [];

  return (
    <div className="mx-auto max-w-6xl">
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
        <h2 className="font-display text-xl font-semibold">Class schedule</h2>
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

      {/* Marks & results link (UCM-F18…F24) */}
      {canManage || isStudentishEnrolled ? (
        <p className="mt-6">
          <Link
            href={`/courses/${course.id}/marks`}
            className="inline-flex h-10 items-center rounded-md border border-primary bg-surface px-4 text-sm font-medium text-primary transition-colors duration-150 hover:bg-primary-soft"
          >
            {canManage ? "Marks & results — enter marks, publish" : "View my marks & results"}
          </Link>
        </p>
      ) : null}

      {/* AI tools (UCM-A1–A3) */}
      {canManage || isStudentishEnrolled ? (
        <div className="mt-3 flex flex-wrap gap-3">
          <Link href={`/courses/${course.id}/assistant`} className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-sm font-medium transition-colors duration-150 hover:bg-primary-soft">
            AI Course Assistant
          </Link>
          <Link href={`/courses/${course.id}/summaries`} className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-sm font-medium transition-colors duration-150 hover:bg-primary-soft">
            AI summaries
          </Link>
          <Link href={`/courses/${course.id}/quiz`} className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-sm font-medium transition-colors duration-150 hover:bg-primary-soft">
            Quiz drafts
          </Link>
        </div>
      ) : null}

      {/* Materials (UCM-F8) */}
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold">Materials</h2>
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

      {/* Notes shared by course members (UCM-C1) */}
      {canManage || isStudentishEnrolled ? (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">Notes</h2>
          {notes.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No notes yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {notes.map((n) => (
                <li key={n.id} className={`flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2 text-sm ${n.pinned ? "border-l-4 border-l-primary" : ""}`}>
                  <a href={`/api/notes/${n.id}/download`} className="font-medium hover:underline">
                    {n.title}
                  </a>
                  {n.pinned ? (
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-hover">
                      pinned
                    </span>
                  ) : null}
                  <span className="text-xs text-muted">by {n.uploaderName}</span>
                  <span className="num text-xs text-muted">
                    {n.downloads} download{n.downloads === 1 ? "" : "s"}
                  </span>
                  <span className="ml-auto">
                    <NoteActions
                      note={n}
                      canPin={canManage}
                      canDelete={isAdmin || n.uploaderId === user.id || isTeacherOfCourse}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {canManage || isStudentishEnrolled ? (
            <div className="mt-4">
              <ModalButton
                label="Share a note"
                title="Share a note"
                description="Upload a PDF or image note for everyone in this course."
              >
                <NoteUploader courseId={course.id} />
              </ModalButton>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Assignments (UCM-F10…F14) */}
      {canManage || myRow?.status === "enrolled" || user.role === "alumni" ? (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">Assignments</h2>
          {assignments.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              {canManage ? "No assignments yet — add the first one below." : "No assignments yet."}
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {assignments.map((a) => {
                const ds = deadlineState(a.deadline);
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2">
                    <Link href={`/courses/${course.id}/assignments/${a.id}`} className="font-medium hover:underline">
                      {a.title}
                    </Link>
                    <span className="num text-xs text-muted">{a.points} pts</span>
                    <span
                      className={`num rounded-full px-2 py-0.5 text-xs font-medium ${
                        ds === "closed" ? "bg-danger-soft text-danger" : ds === "due-soon" ? "bg-warn-soft text-warn" : "bg-primary-soft text-primary-hover"
                      }`}
                    >
                      due {formatDeadline(a.deadline)}
                    </span>
                    {canManage ? (
                      <span className="ml-auto flex items-center gap-3">
                        <DeleteAssignmentButton assignmentId={a.id} courseId={course.id} />
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {canManage ? (
            <div className="mt-4">
              <AssignmentForm courseId={course.id} />
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Attendance (UCM-F15…F17) */}
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold">Attendance</h2>
        {canManage ? (
          <AttendanceManager courseId={course.id} sections={rosterSections} />
        ) : isStudentishEnrolled ? (
          <MyAttendance courseId={course.id} userId={user.id} />
        ) : (
          <p className="mt-2 text-sm text-muted">
            {isStudent || isCr ? "Enroll to track your attendance." : "Attendance appears once sessions are held."}
          </p>
        )}
      </section>

      {/* Syllabus */}
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold">Syllabus</h2>
        {course.syllabus ? (
          <p className="mt-2 whitespace-pre-line text-sm">{course.syllabus}</p>
        ) : (
          <p className="mt-2 text-sm text-muted">No syllabus added yet.</p>
        )}
      </section>

      {/* Roster (teacher/admin/CR) */}
      {canSeeRoster ? (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">
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
        <section className="mt-10 flex flex-col gap-4">
          <h2 className="font-display text-xl font-semibold">Manage course</h2>
          <div>
            <h3 className="text-sm font-semibold text-muted">Manual enrollment</h3>
            <p className="mt-0.5 text-xs text-muted">
              Enroll a student by email if they could not self-enroll during the open window.
            </p>
            <div className="mt-2">
              <ManualEnrollForm courseId={course.id} />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-muted">Course settings</h3>
            <p className="mt-0.5 text-xs text-muted">
              Details, schedule slots and visibility for this course.
            </p>
            <div className="mt-2">
              <CourseForm
                course={course}
                departments={departments}
                semesters={await listSemesters(session)}
                teacherScoped={isTeacherOfCourse}
              />
            </div>
          </div>
          {isAdmin ? (
            <div>
              <h3 className="text-sm font-semibold text-muted">Teachers</h3>
              <p className="mt-0.5 text-xs text-muted">Who can manage materials, assignments, attendance and marks.</p>
              <div className="mt-2">
                <TeacherPicker courseId={course.id} teachers={teachers} assigned={course.teacherIds} />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function DAY(day: number): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] ?? "";
}

/* --------------------------------------------------- attendance (Phase 5) */

/** Manager panel: open sessions, per-student digest, threshold override. */
async function AttendanceManager({
  courseId,
  sections,
}: {
  courseId: string;
  sections: string[];
}) {
  const { user } = await appGate();
  const session = { user };
  const [digest, sessions] = await Promise.all([courseDigest(session, courseId), listSessions(session, courseId)]);

  return (
    <div className="mt-2 flex flex-col gap-4">
      <OpenSessionForm courseId={courseId} sections={sections.length > 0 ? sections : ["A"]} today={dhakaToday()} />

      <div>
        <h3 className="text-sm font-semibold text-muted">Sessions</h3>
        {sessions.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No sessions yet — open the first one above.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {sessions.slice(0, 10).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2">
                <Link href={`/courses/${courseId}/attendance/${s.id}`} className="font-medium hover:underline">
                  {s.date} · section {s.section}
                </Link>
                {s.topic ? <span className="text-xs text-muted">{s.topic}</span> : null}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    s.status === "open" ? "bg-warn-soft text-warn" : "bg-primary-soft text-primary-hover"
                  }`}
                >
                  {s.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted">Attendance digest (low first)</h3>
        <p className="mt-1 text-xs text-muted">
          Threshold {digest.threshold}% · present + late / applicable sessions
        </p>
        {digest.rows.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No students enrolled yet.</p>
        ) : (
          <table className="mt-2 w-full border-collapse text-sm">
            <caption className="sr-only">Attendance percentage per student</caption>
            <thead>
              <tr className="border-b border-border text-left text-muted">
                <th className="py-2 pr-3 font-medium">Student</th>
                <th className="py-2 pr-3 font-medium">Sec</th>
                <th className="py-2 pr-3 font-medium">Attended</th>
                <th className="py-2 pr-3 font-medium">%</th>
                <th className="py-2 font-medium">Warning</th>
              </tr>
            </thead>
            <tbody>
              {digest.rows.map((r) => (
                <tr key={r.userId} className="border-b border-border hover:bg-primary-soft">
                  <td className="py-2 pr-3">
                    {r.name}
                    {r.studentId ? <span className="num ml-2 text-xs text-muted">{r.studentId}</span> : null}
                  </td>
                  <td className="py-2 pr-3">{r.section}</td>
                  <td className="num py-2 pr-3">
                    {r.stats.possible === 0 ? "—" : `${r.stats.attended}/${r.stats.possible}`}
                  </td>
                  <td className="num py-2 pr-3">{r.stats.pct === null ? "—" : `${r.stats.pct}%`}</td>
                  <td className="py-2">
                    {r.warning ? (
                      <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                        below {digest.threshold}%
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ThresholdForm courseId={courseId} current={digest.threshold} />
    </div>
  );
}

/** Student/CR panel: own percentage + recent records (UCM-F16/F17). */
async function MyAttendance({ courseId, userId }: { courseId: string; userId: string }) {
  const { user } = await appGate();
  const session = { user };
  const att = await myAttendance(session, courseId, userId);
  const warning = lowAttendanceMessage(att.stats.pct, att.threshold);

  return (
    <div className="mt-2">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={`num rounded-full px-3 py-1 text-xs font-medium ${
            warning ? "bg-danger-soft text-danger" : att.stats.pct === null ? "bg-primary-soft text-primary-hover" : "bg-primary-soft text-primary-hover"
          }`}
        >
          {att.stats.pct === null ? "No sessions yet" : `${att.stats.pct}%`}
        </span>
        {att.stats.pct !== null ? (
          <span className="num text-muted">
            {att.stats.attended}/{att.stats.possible} sessions (present + late)
          </span>
        ) : null}
      </p>
      {warning ? (
        <p role="alert" className="mt-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {warning}
        </p>
      ) : null}
      {att.sessions.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {att.sessions.slice(0, 8).map((s) => {
            const rec = att.records.find((r) => r.sessionId === s.id);
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/courses/${courseId}/attendance/${s.id}`} className="hover:underline">
                  {s.date}
                  {s.topic ? ` — ${s.topic}` : ""}
                </Link>
                <span className="text-xs text-muted">{rec ? rec.status : "not marked"}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
