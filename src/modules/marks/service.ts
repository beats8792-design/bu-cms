import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import {
  MarkSaveSchema,
  SchemaDraftSchema,
  canWriteMark,
  componentAverages,
  gradeFor,
  validateComponents,
  validateGradeTable,
  weightedTotal,
  DEFAULT_GRADE_TABLE,
  type AssessmentComponent,
  type AssessmentSchema,
  type MarkHistoryEntry,
  type GradeTableEntry,
} from "@/modules/marks/schema";
import { toObjectId } from "@/modules/academic/model";
import type { CourseRow } from "@/modules/academic/courses";
import { ObjectId } from "mongodb";

/**
 * Marks & results service (UCM-F18…F24). Authorization spine as before:
 * manage = admin or assigned teacher; students/CRs read only published
 * results. Totals + grades are computed on the fly — never stored.
 * Publication fan-out (UCM-F25) lands with the Phase 7 notification service.
 */

const MAX_HISTORY = 20;

interface SchemaDoc {
  _id: unknown;
  courseId: string;
  components: AssessmentComponent[];
  gradeTable?: GradeTableEntry[];
  published: boolean;
  publishedAt: Date | null;
  updatedBy: string;
}

interface MarkDoc {
  _id: unknown;
  courseId: string;
  userId: string;
  componentKey: string;
  score: number | null;
  updatedBy: string;
  updatedAt: Date;
  history: MarkHistoryEntry[];
}

export interface AuditEntry extends MarkHistoryEntry {
  userId: string;
  userName: string;
  componentKey: string;
  override: boolean;
}

export type { MarksGridRow } from "@/modules/marks/schema";
import type { MarksGridRow } from "@/modules/marks/schema";

/* ------------------------------------------------------------- auth helpers */

async function loadCourse(courseId: string): Promise<CourseRow> {
  const db = await getDb();
  const doc = (await db.collection("courses").findOne({ _id: toObjectId(courseId) })) as
    | ({ _id: unknown } & CourseRow)
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Course not found.");
  return doc;
}

function isManager(course: CourseRow, session: SessionForAuth): boolean {
  const user = session.user as { id: string; role: string };
  return user.role === "admin" || course.teacherIds.includes(user.id);
}

function fallbackSchema(courseId: string): AssessmentSchema {
  return {
    courseId,
    components: [],
    gradeTable: DEFAULT_GRADE_TABLE,
    published: false,
    publishedAt: null,
    updatedBy: "",
  };
}

function toSchema(d: SchemaDoc & { _id: unknown }): AssessmentSchema {
  return {
    courseId: d.courseId,
    components: d.components ?? [],
    gradeTable: d.gradeTable && d.gradeTable.length > 0 ? d.gradeTable : DEFAULT_GRADE_TABLE,
    published: Boolean(d.published),
    publishedAt: d.publishedAt ? d.publishedAt.toISOString() : null,
    updatedBy: d.updatedBy,
  };
}

/* ------------------------------------------------------------------ queries */

/** Assessment plan (UCM-F18) — visible to managers + enrolled students/CRs. */
export async function getSchema(
  session: SessionForAuth | null,
  courseId: string,
): Promise<AssessmentSchema> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  await loadCourse(courseId);
  const doc = (await (await getDb())
    .collection("assessment_schemas")
    .findOne({ courseId })) as (SchemaDoc & { _id: unknown }) | null;
  return doc ? toSchema(doc) : fallbackSchema(courseId);
}

/** Teacher spreadsheet (UCM-F19): roster × components with computed totals. */
export async function marksGrid(
  session: SessionForAuth | null,
  courseId: string,
): Promise<{ schema: AssessmentSchema; rows: MarksGridRow[]; audit: AuditEntry[] }> {
  requireRole(session, ["admin", "teacher"]);
  const course = await loadCourse(courseId);
  if (!isManager(course, session as SessionForAuth)) {
    throw new AppError("FORBIDDEN", "Only teachers of this course can view the marks grid.");
  }
  const schema = await getSchema(session, courseId);
  const db = await getDb();

  const enrollDocs = (await db
    .collection("enrollments")
    .find({ courseId, status: "enrolled" })
    .toArray()) as unknown as Array<{ userId: string; section: string }>;
  const userIds = enrollDocs.map((e) => e.userId);
  const users = userIds.length
    ? ((await db
        .collection("user")
        .find({ _id: { $in: userIds as unknown as ObjectId[] } }, { projection: { name: 1, studentId: 1 } })
        .toArray()) as unknown as Array<{ _id: string; name: string; studentId?: string }>)
    : [];
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const markDocs = (await db
    .collection("marks")
    .find({ courseId })
    .toArray()) as unknown as (MarkDoc & { _id: unknown })[];

  const scoresByUser = new Map<string, Record<string, number | null>>();
  const lastAtByUser = new Map<string, string>();
  const audit: AuditEntry[] = [];
  for (const d of markDocs) {
    const row = scoresByUser.get(d.userId) ?? {};
    row[d.componentKey] = d.score;
    scoresByUser.set(d.userId, row);
    lastAtByUser.set(d.userId, (lastAtByUser.get(d.userId) ?? "") > d.updatedAt.toISOString() ? (lastAtByUser.get(d.userId) as string) : d.updatedAt.toISOString());
    for (const h of d.history ?? []) {
      audit.push({
        userId: d.userId,
        userName: userById.get(d.userId)?.name ?? "Unknown",
        componentKey: d.componentKey,
        score: h.score,
        by: h.by,
        at: h.at,
        reason: h.reason ?? "",
        override: (h as { override?: boolean }).override ?? false,
      });
    }
  }
  audit.sort((a, b) => b.at.localeCompare(a.at));

  const rows: MarksGridRow[] = enrollDocs
    .map((e) => {
      const scoreMap = new Map<string, number | null>(Object.entries(scoresByUser.get(e.userId) ?? {}));
      const total = weightedTotal(scoreMap, schema.components);
      const grade = gradeFor(total, schema.gradeTable);
      return {
        userId: e.userId,
        name: userById.get(e.userId)?.name ?? "Unknown",
        studentId: userById.get(e.userId)?.studentId ?? "",
        section: e.section,
        scores: scoresByUser.get(e.userId) ?? {},
        total,
        grade: grade.letter,
        gradePoint: grade.point,
        updatedAt: lastAtByUser.get(e.userId) ?? null,
      };
    })
    .sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name));

  return { schema, rows, audit: audit.slice(0, 100) };
}

/** Published result for one student (UCM-F22/F24) + class comparison. */
export async function studentResult(
  session: SessionForAuth | null,
  courseId: string,
): Promise<{
  schema: AssessmentSchema;
  scores: Record<string, number | null>;
  total: number;
  grade: string;
  gradePoint: number;
  averages: Record<string, number | null>; // per component, class avg share 0–100
  mine: Record<string, number | null>; // own share 0–100 for the bars
}> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const user = session!.user as { id: string; role: string };
  const course = await loadCourse(courseId);
  const schema = await getSchema(session, courseId);
  const manager = isManager(course, session as SessionForAuth);

  if (!schema.published && !manager) {
    throw new AppError("CONFLICT", "Results are not published for this course yet.");
  }

  const db = await getDb();
  const markDocs = (await db
    .collection("marks")
    .find({ courseId })
    .toArray()) as unknown as (MarkDoc & { _id: unknown })[];

  const allRows: Array<{ scores: Map<string, number | null> }> = markDocs.map((d) => {
    const m = new Map<string, number | null>();
    m.set(d.componentKey, d.score);
    return { scores: m };
  });
  const avgRaw = componentAverages(allRows, schema.components);
  const averages: Record<string, number | null> = {};
  for (const c of schema.components) {
    const avg = avgRaw.get(c.key) ?? null;
    averages[c.key] =
      avg === null
        ? null
        : Math.round((avg / c.maxMarks) * 1000) / 10;
  }

  const mine: Record<string, number | null> = {};
  const scores: Record<string, number | null> = {};
  for (const d of markDocs) {
    if (d.userId !== user.id) continue;
    scores[d.componentKey] = d.score;
    mine[d.componentKey] =
      d.score === null ? null : Math.round((d.score / (schema.components.find((c) => c.key === d.componentKey)?.maxMarks ?? 1)) * 1000) / 10;
  }

  const total = weightedTotal(new Map(Object.entries(scores)), schema.components);
  const grade = gradeFor(total, schema.gradeTable);
  return { schema, scores, total, grade: grade.letter, gradePoint: grade.point, averages, mine };
}

/* ------------------------------------------------------------------- writes */

/** UCM-F18: create/update the assessment plan (weights must sum to 100). */
export async function saveSchema(
  session: SessionForAuth | null,
  courseId: string,
  input: unknown,
  opts: { gradeTable?: GradeTableEntry[] } = {},
): Promise<void> {
  requireRole(session, ["admin", "teacher"]);
  const parsed = SchemaDraftSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);

  const course = await loadCourse(courseId);
  if (!isManager(course, session as SessionForAuth)) {
    throw new AppError("FORBIDDEN", "Only teachers of this course can edit the assessment plan.");
  }

  const check = validateComponents(parsed.data.components);
  if (!check.ok) throw new AppError("VALIDATION_FAILED", check.reason);

  const gradeTable = opts.gradeTable && opts.gradeTable.length > 0 ? opts.gradeTable : DEFAULT_GRADE_TABLE;
  const tableCheck = validateGradeTable(gradeTable);
  if (!tableCheck.ok) throw new AppError("VALIDATION_FAILED", tableCheck.reason);

  const db = await getDb();
  const existing = (await db.collection("assessment_schemas").findOne({ courseId })) as
    | (SchemaDoc & { _id: unknown })
    | null;

  // Component keys carry marks — removing/renaming a keyed component would
  // orphan its marks; require an empty sheet or keep all keys.
  if (existing) {
    const markDocs = (await db
      .collection("marks")
      .find({ courseId }, { projection: { componentKey: 1 } })
      .toArray()) as unknown as Array<{ componentKey: string }>;
    const usedKeys = new Set(markDocs.map((m) => m.componentKey));
    const newKeys = new Set(parsed.data.components.map((c) => c.key));
    const missing = [...usedKeys].filter((k) => !newKeys.has(k));
    if (missing.length > 0) {
      throw new AppError(
        "CONFLICT",
        `Marks already exist for component(s): ${missing.join(", ")}. Keep those keys or clear the marks first.`,
      );
    }
  }

  await db.collection("assessment_schemas").updateOne(
    { courseId },
    {
      $set: {
        components: parsed.data.components,
        gradeTable,
        updatedBy: (session!.user as { id: string }).id,
        updatedAt: new Date(),
      },
      $setOnInsert: { published: false, publishedAt: null },
    },
    { upsert: true },
  );
}

/** UCM-F19/F23: one mark write; audit trail appended to the doc. */
export async function saveMark(
  session: SessionForAuth | null,
  input: unknown,
): Promise<void> {
  requireRole(session, ["admin", "teacher"]);
  const parsed = MarkSaveSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);
  const { courseId, userId, componentKey, score, reason } = parsed.data;

  const course = await loadCourse(courseId);
  const user = session!.user as { id: string; role: string };
  const schema = await getSchema(session, courseId);
  const component = schema.components.find((c) => c.key === componentKey);
  if (!component) {
    throw new AppError("VALIDATION_FAILED", "That component is not in the assessment plan.");
  }
  if (score !== null && score > component.maxMarks) {
    throw new AppError("VALIDATION_FAILED", `${component.name} max is ${component.maxMarks}.`);
  }

  const decision = canWriteMark({
    role: user.role,
    isTeacherOfCourse: course.teacherIds.includes(user.id),
    published: schema.published,
    hasReason: reason.length > 0,
  });
  if (!decision.ok) throw new AppError("FORBIDDEN", decision.reason);

  const db = await getDb();
  const now = new Date();
  const by = user.id;
  if (score === null) {
    // Clearing a mark removes the doc entirely (totals treat absence as 0).
    await db.collection("marks").deleteOne({ courseId, userId, componentKey });
    return;
  }

  await db.collection("marks").updateOne(
    { courseId, userId, componentKey },
    {
      $set: { score, updatedBy: by, updatedAt: now },
      $push: {
        history: {
          $each: [{ score, by, at: now.toISOString(), reason, override: decision.isOverride }],
          $slice: -MAX_HISTORY,
        } as never,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
}

/** UCM-F25: flip publish; visibility + fan-out (Phase 7) follow the flag. */
export async function setPublished(
  session: SessionForAuth | null,
  courseId: string,
  published: boolean,
): Promise<void> {
  requireRole(session, ["admin", "teacher"]);
  const course = await loadCourse(courseId);
  if (!isManager(course, session as SessionForAuth)) {
    throw new AppError("FORBIDDEN", "Only teachers of this course can publish results.");
  }
  if (published) {
    const schema = await getSchema(session, courseId);
    if (schema.components.length === 0) {
      throw new AppError("CONFLICT", "Set up the assessment plan before publishing.");
    }
  }
  const db = (await getDb());
  await db.collection("assessment_schemas").updateOne(
    { courseId },
    {
      $set: {
        published,
        ...(published ? { publishedAt: new Date() } : { publishedAt: null }),
      },
      $setOnInsert: {
        components: [],
        updatedBy: (session!.user as { id: string }).id,
      },
    },
    { upsert: true },
  );

  // UCM-F25: publishing notifies the course's students (fan-out via
  // notifications; emails follow the Phase 7 Resend wiring if enabled).
  if (published) {
    const enrolled = (await db
      .collection("enrollments")
      .find({ courseId, status: "enrolled" }, { projection: { userId: 1 } })
      .toArray()) as unknown as Array<{ userId: string }>;
    const { notifyResultsPublished } = await import("@/modules/notifications/service");
    await notifyResultsPublished(courseId, course.code, enrolled.map((e) => e.userId));
  }
}
