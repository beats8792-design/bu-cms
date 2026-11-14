import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { weightedTotal, gradeFor, type AssessmentComponent } from "@/modules/marks/schema";
import { toObjectId } from "@/modules/academic/model";

/**
 * Admin analytics (UCM-D4…D7). All aggregations are plain Mongo queries + JS
 * reduction — v1 scale (a department's worth of rows) makes pipelines
 * unnecessary. Pure helpers (pct/fill/at-risk) live at the top so they unit
 * test without a database.
 */

/* --------------------------------------------------------- pure helpers */

/** Attendance pct; null when nothing is applicable yet. */
export function attPct(attended: number, possible: number): number | null {
  if (possible <= 0) return null;
  return Math.round((attended / possible) * 1000) / 10;
}

/** Seat fill % of a course (enrolled vs seatLimit). */
export function fillPct(enrolled: number, seatLimit: number): number {
  if (seatLimit <= 0) return 0;
  return Math.round((enrolled / seatLimit) * 1000) / 10;
}

export interface RiskFlags {
  lowAttendance: boolean;
  failing: boolean;
  noMarksData: boolean;
}

/**
 * At-risk predicate (UCM-D5): low attendance = below the course threshold;
 * failing = weighted total < 40 **when marks exist** (a student with no
 * entered marks is "no data", not an F).
 */
export function riskFlags(pct: number | null, threshold: number, total: number | null): RiskFlags {
  return {
    lowAttendance: pct !== null && pct < threshold,
    failing: total !== null && total < 40,
    noMarksData: total === null,
  };
}

export function isAtRisk(flags: RiskFlags): boolean {
  return flags.lowAttendance || flags.failing;
}

/* ------------------------------------------------------------ service types */

export interface InstitutionCounts {
  usersByRole: Record<string, number>;
  pending: number;
  suspended: number;
  courses: number;
  departments: number;
  activeEnrollments: number;
}

export interface DeptHealthRow {
  id: string;
  code: string;
  name: string;
  teachers: number;
  students: number;
  courses: number;
  seats: number;
  enrolled: number;
  fill: number;
}

export interface CourseTrend {
  courseId: string;
  code: string;
  title: string;
  departmentId: string;
  pct: number | null;
  attended: number;
  possible: number;
}

export interface CourseGrades {
  courseId: string;
  code: string;
  title: string;
  departmentId: string;
  published: boolean;
  graded: number;
  averageGpa: number | null;
  averageTotal: number | null;
  distribution: Array<{ letter: string; count: number }>;
}

export interface AtRiskRow {
  courseId: string;
  courseCode: string;
  userId: string;
  name: string;
  studentId: string;
  section: string;
  pct: number | null;
  total: number | null;
  threshold: number;
  flags: RiskFlags;
}

export interface AssignmentStat {
  assignmentId: string;
  courseId: string;
  courseCode: string;
  title: string;
  points: number;
  enrolled: number;
  submitted: number;
  late: number;
  graded: number;
  rate: number;
}

export interface DataQualityIssue {
  kind: "schema-missing" | "marks-missing" | "stale-session" | "extraction-failed";
  courseId: string;
  courseCode: string;
  message: string;
}

/* ---------------------------------------------------------------- queries */

interface CourseRaw {
  _id: unknown;
  code: string;
  title: string;
  departmentId: string;
  seatLimit: number;
  teacherIds: string[];
  attendanceThreshold?: number;
}

/** Mongo documents are untyped; one narrow point per collection keeps the rest honest. */
async function fetchAll(db: Awaited<ReturnType<typeof getDb>>, coll: string, filter: Record<string, unknown>, projection?: Record<string, unknown>) {
  return db.collection(coll).find(filter, projection ? { projection } : undefined).toArray() as unknown as Promise<
    Array<Record<string, unknown>>
  >;
}

interface SchemaRaw {
  courseId: string;
  components: AssessmentComponent[];
  published?: boolean;
}

export async function institutionCounts(session: SessionForAuth | null): Promise<InstitutionCounts> {
  requireRole(session, ["admin"]);
  const db = await getDb();
  const [users, courses, departments, enrollments] = await Promise.all([
    db.collection("user").aggregate([{ $group: { _id: { role: "$role", status: "$status" }, n: { $sum: 1 } } }]).toArray(),
    db.collection("courses").countDocuments({}),
    db.collection("departments").countDocuments({}),
    db.collection("enrollments").countDocuments({ status: "enrolled" }),
  ]);
  const usersByRole: Record<string, number> = {};
  let pending = 0;
  let suspended = 0;
  for (const row of users as unknown as Array<{ _id: { role?: string; status?: string }; n: number }>) {
    const role = row._id.role ?? "unknown";
    usersByRole[role] = (usersByRole[role] ?? 0) + row.n;
    if (row._id.status === "pending") pending += row.n;
    if (row._id.status === "suspended") suspended += row.n;
  }
  return {
    usersByRole,
    pending,
    suspended,
    courses,
    departments,
    activeEnrollments: enrollments,
  };
}

async function loadCourses(session: SessionForAuth | null, departmentId?: string): Promise<CourseRaw[]> {
  const db = await getDb();
  const filter: Record<string, unknown> = {};
  if (departmentId) filter.departmentId = departmentId;
  return (await db.collection("courses").find(filter).sort({ code: 1 }).toArray()) as unknown as CourseRaw[];
}

export async function departmentHealth(session: SessionForAuth | null): Promise<DeptHealthRow[]> {
  requireRole(session, ["admin"]);
  const db = await getDb();
  const [departments, courses, enrollments, userCounts] = await Promise.all([
    db.collection("departments").find({}).sort({ code: 1 }).toArray() as unknown as Promise<
      Array<{ _id: unknown; code: string; name: string }>
    >,
    loadCourses(session),
    db.collection("enrollments").find({ status: "enrolled" }).toArray() as unknown as Promise<
      Array<{ courseId: string }>
    >,
    db
      .collection("user")
      .aggregate([
        { $match: { role: { $in: ["student", "cr"] }, status: "active" } },
        { $group: { _id: "$departmentId", n: { $sum: 1 } } },
      ])
      .toArray() as unknown as Promise<Array<{ _id: string; n: number }>>,
  ]);
  const studentsByDept = new Map(userCounts.map((r) => [r._id ?? "", r.n]));
  const deptIds = new Set(departments.map((d) => String(d._id)));
  const scoped = courses.filter((c) => deptIds.has(c.departmentId));
  const enrolledByDept = new Map<string, number>();
  const courseById = new Map(scoped.map((c) => [String(c._id), c]));
  for (const e of enrollments) {
    const course = courseById.get(e.courseId);
    if (course) {
      enrolledByDept.set(course.departmentId, (enrolledByDept.get(course.departmentId) ?? 0) + 1);
    }
  }
  return departments.map((d) => {
    const id = String(d._id);
    const deptCourses = scoped.filter((c) => c.departmentId === id);
    const seats = deptCourses.reduce((acc, c) => acc + (c.seatLimit ?? 0), 0);
    const enrolled = enrolledByDept.get(id) ?? 0;
    return {
      id,
      code: d.code,
      name: d.name,
      teachers: new Set(deptCourses.flatMap((c) => c.teacherIds ?? [])).size,
      students: studentsByDept.get(id) ?? 0,
      courses: deptCourses.length,
      seats,
      enrolled,
      fill: fillPct(enrolled, seats),
    };
  });
}

export async function attendanceTrends(
  session: SessionForAuth | null,
  departmentId?: string,
): Promise<CourseTrend[]> {
  requireRole(session, ["admin"]);
  const courses = await loadCourses(session, departmentId);
  const courseIds = courses.map((c) => String(c._id));
  if (courseIds.length === 0) return [];
  const db = await getDb();
  const sessions = (await db
    .collection("attendance_sessions")
    .find({ courseId: { $in: courseIds }, status: { $ne: "open" } })
    .toArray()) as unknown as Array<{ _id: unknown; courseId: string }>;
  const closedIds = new Set(sessions.map((s) => String(s._id)));
  const courseBySession = new Map(sessions.map((s) => [String(s._id), s.courseId]));
  const records = (await db
    .collection("attendance_records")
    .find({ sessionId: { $in: [...closedIds] as never[] } })
    .toArray()) as unknown as Array<{ sessionId: string; status: string }>;

  const agg = new Map<string, { attended: number; possible: number }>();
  for (const r of records) {
    if (!closedIds.has(r.sessionId)) continue;
    const courseId = courseBySession.get(r.sessionId);
    if (!courseId) continue;
    const cur = agg.get(courseId) ?? { attended: 0, possible: 0 };
    cur.possible++;
    if (r.status === "present" || r.status === "late") cur.attended++;
    agg.set(courseId, cur);
  }
  return courses
    .map((c) => {
      const a = agg.get(String(c._id)) ?? { attended: 0, possible: 0 };
      return {
        courseId: String(c._id),
        code: c.code,
        title: c.title,
        departmentId: c.departmentId,
        pct: attPct(a.attended, a.possible),
        attended: a.attended,
        possible: a.possible,
      };
    })
    .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101)); // lowest first
}

export async function gradeDistributions(
  session: SessionForAuth | null,
  departmentId?: string,
): Promise<CourseGrades[]> {
  requireRole(session, ["admin"]);
  const courses = await loadCourses(session, departmentId);
  const courseIds = courses.map((c) => String(c._id));
  if (courseIds.length === 0) return [];
  const db = await getDb();
  const [schemas, marks] = await Promise.all([
    fetchAll(db, "assessment_schemas", { courseId: { $in: courseIds } }) as unknown as Promise<SchemaRaw[]>,
    fetchAll(db, "marks", { courseId: { $in: courseIds } }) as unknown as Promise<
      Array<{ courseId: string; userId: string; componentKey: string; score: number | null }>
    >,
  ]);
  const schemaByCourse = new Map(schemas.map((s) => [s.courseId, s]));
  const marksByCourseUser = new Map<string, Map<string, Map<string, number | null>>>();
  for (const m of marks) {
    const users = marksByCourseUser.get(m.courseId) ?? new Map();
    const comps = users.get(m.userId) ?? new Map();
    comps.set(m.componentKey, m.score);
    users.set(m.userId, comps);
    marksByCourseUser.set(m.courseId, users);
  }

  return courses
    .filter((c) => schemaByCourse.has(String(c._id)))
    .map((c) => {
      const id = String(c._id);
      const schema = schemaByCourse.get(id)!;
      const users = marksByCourseUser.get(id) ?? new Map<string, Map<string, number | null>>();
      const dist = new Map<string, number>();
      let gpaSum = 0;
      let totalSum = 0;
      let graded = 0;
      for (const comps of users.values()) {
        const total = weightedTotal(comps, schema.components);
        const grade = gradeFor(total);
        dist.set(grade.letter, (dist.get(grade.letter) ?? 0) + 1);
        gpaSum += grade.point;
        totalSum += total;
        graded++;
      }
      return {
        courseId: id,
        code: c.code,
        title: c.title,
        departmentId: c.departmentId,
        published: Boolean(schema.published),
        graded,
        averageGpa: graded === 0 ? null : Math.round((gpaSum / graded) * 100) / 100,
        averageTotal: graded === 0 ? null : Math.round((totalSum / graded) * 100) / 100,
        distribution: [...dist.entries()]
          .map(([letter, count]) => ({ letter, count }))
          .sort((a, b) => b.count - a.count),
      };
    });
}

export async function atRiskStudents(
  session: SessionForAuth | null,
  departmentId?: string,
): Promise<AtRiskRow[]> {
  requireRole(session, ["admin"]);
  const courses = await loadCourses(session, departmentId);
  const courseIds = courses.map((c) => String(c._id));
  if (courseIds.length === 0) return [];
  const db = await getDb();

  const [enrollments, sessions, schemas, marks] = await Promise.all([
    fetchAll(db, "enrollments", { courseId: { $in: courseIds }, status: "enrolled" }) as unknown as Promise<
      Array<{ courseId: string; userId: string; section: string }>
    >,
    fetchAll(db, "attendance_sessions", { courseId: { $in: courseIds }, status: { $ne: "open" } }) as unknown as Promise<
      Array<{ _id: unknown; courseId: string; section: string }>
    >,
    fetchAll(db, "assessment_schemas", { courseId: { $in: courseIds } }) as unknown as Promise<SchemaRaw[]>,
    fetchAll(db, "marks", { courseId: { $in: courseIds } }) as unknown as Promise<
      Array<{ courseId: string; userId: string; componentKey: string; score: number | null }>
    >,
  ]);
  // Records scoped to the fetched sessions only — never a full-collection scan.
  const sessionIds = sessions.map((s) => String(s._id));
  const records = (await db
    .collection("attendance_records")
    .find({ sessionId: { $in: sessionIds as never[] } })
    .toArray()) as unknown as Array<{ sessionId: string; userId: string; status: string }>;

  const userIds = [...new Set(enrollments.map((e) => e.userId))];
  const users = (await db
    .collection("user")
    .find({ _id: { $in: userIds.map(toObjectId) } }, { projection: { name: 1, studentId: 1 } })
    .toArray()) as unknown as Array<{ _id: string; name: string; studentId?: string }>;
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const sessionById = new Map(sessions.map((s) => [String(s._id), s]));

  // attendance per (course, user): own-section sessions only
  const att = new Map<string, { attended: number; possible: number }>();
  for (const r of records) {
    const s = sessionById.get(r.sessionId);
    if (!s) continue;
    const en = enrollments.find((e) => e.courseId === s.courseId && e.userId === r.userId);
    if (!en || en.section !== s.section) continue;
    const key = `${s.courseId}:${r.userId}`;
    const cur = att.get(key) ?? { attended: 0, possible: 0 };
    cur.possible++;
    if (r.status === "present" || r.status === "late") cur.attended++;
    att.set(key, cur);
  }

  const schemaByCourse = new Map(schemas.map((s) => [s.courseId, s]));
  const marksByCourseUser = new Map<string, Map<string, Map<string, number | null>>>();
  for (const m of marks) {
    const usersMap = marksByCourseUser.get(m.courseId) ?? new Map();
    const comps = usersMap.get(m.userId) ?? new Map();
    comps.set(m.componentKey, m.score);
    usersMap.set(m.userId, comps);
    marksByCourseUser.set(m.courseId, usersMap);
  }

  const rows: AtRiskRow[] = [];
  const courseById = new Map(courses.map((c) => [String(c._id), c]));
  for (const e of enrollments) {
    const course = courseById.get(e.courseId);
    if (!course) continue;
    const threshold = course.attendanceThreshold ?? 75;
    const a = att.get(`${e.courseId}:${e.userId}`);
    const pct = a ? attPct(a.attended, a.possible) : null;
    const comps = marksByCourseUser.get(e.courseId)?.get(e.userId);
    const hasMarks = comps !== undefined && comps.size > 0;
    const schema = schemaByCourse.get(e.courseId);
    const total = hasMarks && schema ? weightedTotal(comps, schema.components) : null;
    const flags = riskFlags(pct, threshold, total);
    if (!isAtRisk(flags)) continue;
    const u = userById.get(e.userId);
    rows.push({
      courseId: e.courseId,
      courseCode: course.code,
      userId: e.userId,
      name: u?.name ?? "Unknown",
      studentId: u?.studentId ?? "",
      section: e.section,
      pct,
      total,
      threshold,
      flags,
    });
  }
  return rows.sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || (a.total ?? 101) - (b.total ?? 101));
}

export async function assignmentStats(
  session: SessionForAuth | null,
  departmentId?: string,
): Promise<AssignmentStat[]> {
  requireRole(session, ["admin"]);
  const courses = await loadCourses(session, departmentId);
  const courseIds = courses.map((c) => String(c._id));
  if (courseIds.length === 0) return [];
  const db = await getDb();
  // Assignments first, then submissions scoped to their ids — never a
  // full-collection submissions scan.
  const assignments = (await fetchAll(db, "assignments", { courseId: { $in: courseIds } })) as unknown as Array<{
    _id: unknown;
    courseId: string;
    title: string;
    points: number;
  }>;
  const assignmentIds = assignments.map((a) => String(a._id));
  const [submissions, enrollments] = await Promise.all([
    db
      .collection("submissions")
      .find({ assignmentId: { $in: assignmentIds as never[] } })
      .toArray() as unknown as Promise<Array<{ assignmentId: string; isLate?: boolean; score?: number | null }>>,
    db.collection("enrollments").find({ courseId: { $in: courseIds }, status: "enrolled" }).toArray() as unknown as Promise<
      Array<{ courseId: string }>
    >,
  ]);
  const enrolledByCourse = new Map<string, number>();
  for (const e of enrollments) {
    enrolledByCourse.set(e.courseId, (enrolledByCourse.get(e.courseId) ?? 0) + 1);
  }
  const byAssignment = new Map<string, { submitted: number; late: number; graded: number }>();
  for (const s of submissions) {
    const cur = byAssignment.get(s.assignmentId) ?? { submitted: 0, late: 0, graded: 0 };
    cur.submitted++;
    if (s.isLate) cur.late++;
    if (s.score !== null && s.score !== undefined) cur.graded++;
    byAssignment.set(s.assignmentId, cur);
  }
  const courseById = new Map(courses.map((c) => [String(c._id), c]));
  return assignments
    .map((a) => {
      const id = String(a._id);
      const enrolled = enrolledByCourse.get(a.courseId) ?? 0;
      const s = byAssignment.get(id) ?? { submitted: 0, late: 0, graded: 0 };
      const course = courseById.get(a.courseId);
      return {
        assignmentId: id,
        courseId: a.courseId,
        courseCode: course?.code ?? "?",
        title: a.title,
        points: a.points,
        enrolled,
        submitted: s.submitted,
        late: s.late,
        graded: s.graded,
        rate: enrolled === 0 ? 0 : Math.round((s.submitted / enrolled) * 1000) / 10,
      };
    })
    .sort((a, b) => a.courseCode.localeCompare(b.courseCode) || a.title.localeCompare(b.title));
}

export async function dataQuality(
  session: SessionForAuth | null,
  departmentId?: string,
): Promise<DataQualityIssue[]> {
  requireRole(session, ["admin"]);
  const courses = await loadCourses(session, departmentId);
  const courseIds = courses.map((c) => String(c._id));
  if (courseIds.length === 0) return [];
  const db = await getDb();
  const courseById = new Map(courses.map((c) => [String(c._id), c]));
  const issues: DataQualityIssue[] = [];

  const [enrollments, schemas, marks, openSessions, materials] = (await Promise.all([
    fetchAll(db, "enrollments", { courseId: { $in: courseIds }, status: "enrolled" }) as unknown as Promise<
      Array<{ courseId: string; userId: string }>
    >,
    fetchAll(db, "assessment_schemas", { courseId: { $in: courseIds } }) as unknown as Promise<
      Array<{ courseId: string; components: Array<{ key: string; label: string }> }>
    >,
    fetchAll(db, "marks", { courseId: { $in: courseIds } }) as unknown as Promise<
      Array<{ courseId: string; userId: string; componentKey: string }>
    >,
    fetchAll(db, "attendance_sessions", {
      courseId: { $in: courseIds },
      status: "open",
      createdAt: { $lt: new Date(Date.now() - 86_400_000) },
    }) as unknown as Promise<Array<{ courseId: string; date: string; section: string }>>,
    fetchAll(db, "materials", { courseId: { $in: courseIds } }) as unknown as Promise<
      Array<{ courseId: string; title: string; extraction?: { status: string } }>
    >,
  ]));

  // 1) Courses with enrollments but no marks schema.
  const schemaCourseIds = new Set(schemas.map((s) => s.courseId));
  const reportedNoSchema = new Set<string>();
  for (const e of enrollments) {
    const course = courseById.get(e.courseId);
    if (course && !schemaCourseIds.has(e.courseId) && !reportedNoSchema.has(e.courseId)) {
      reportedNoSchema.add(e.courseId);
      issues.push({
        kind: "schema-missing",
        courseId: e.courseId,
        courseCode: course.code,
        message: "No assessment schema set up — results cannot be computed.",
      });
    }
  }

  // 2) Missing marks entries per (course, component, student).
  const marksKey = new Set(marks.map((m) => `${m.courseId}:${m.userId}:${m.componentKey}`));
  const enrolledByCourse = new Map<string, string[]>();
  for (const e of enrollments) {
    const list = enrolledByCourse.get(e.courseId) ?? [];
    list.push(e.userId);
    enrolledByCourse.set(e.courseId, list);
  }
  for (const schema of schemas) {
    const students = enrolledByCourse.get(schema.courseId) ?? [];
    let missing = 0;
    for (const userId of students) {
      for (const comp of schema.components) {
        if (!marksKey.has(`${schema.courseId}:${userId}:${comp.key}`)) missing++;
      }
    }
    if (missing > 0) {
      const course = courseById.get(schema.courseId);
      issues.push({
        kind: "marks-missing",
        courseId: schema.courseId,
        courseCode: course?.code ?? "?",
        message: `${missing} marks ${missing === 1 ? "entry" : "entries"} missing (${schema.components.length} components × ${students.length} students).`,
      });
    }
  }

  // 3) Attendance sessions open for over a day.
  for (const s of openSessions) {
    const course = courseById.get(s.courseId);
    if (course) {
      issues.push({
        kind: "stale-session",
        courseId: s.courseId,
        courseCode: course.code,
        message: `Attendance session ${s.date} (section ${s.section}) has been open for over 24h.`,
      });
    }
  }

  // 4) Materials whose text extraction failed (blocks the AI index).
  for (const m of materials) {
    if (m.extraction?.status === "failed" || m.extraction?.status === "empty") {
      const course = courseById.get(m.courseId);
      if (course) {
        issues.push({
          kind: "extraction-failed",
          courseId: m.courseId,
          courseCode: course.code,
          message: `Material "${m.title}" has no text layer (extraction ${m.extraction.status}).`,
        });
      }
    }
  }

  return issues;
}
