import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import { AiError, aiConfigured, chat, extractJson } from "@/modules/ai/gemini";
import { SummarySchema, type MaterialSummary } from "@/modules/ai/schema";
import { toObjectId } from "@/modules/academic/model";
import { isEnrolledIn } from "@/modules/collab/notes";
import type { CourseRow } from "@/modules/academic/courses";

/**
 * Notes summarizer (UCM-A2): a material's extracted text → structured summary
 * (overview, key points, definitions, formulas, study questions). One cached
 * summary per material; "regenerate" overwrites it. Any course member
 * (managers + enrolled students/CRs) can generate — teachers or students own
 * the source material per PRD.
 */

interface SummaryDoc {
  _id: unknown;
  materialId: string;
  courseId: string;
  summary: {
    overview: string;
    keyPoints: string[];
    definitions: Array<{ term: string; meaning: string }>;
    formulas: string[];
    studyQuestions: string[];
  };
  createdAt: Date;
}

function toSummary(d: SummaryDoc & { _id: unknown }): MaterialSummary {
  return {
    id: String(d._id),
    materialId: d.materialId,
    overview: d.summary.overview,
    keyPoints: d.summary.keyPoints ?? [],
    definitions: d.summary.definitions ?? [],
    formulas: d.summary.formulas ?? [],
    studyQuestions: d.summary.studyQuestions ?? [],
    createdAt: (d.createdAt ?? new Date()).toISOString(),
  };
}

export async function getSummary(
  session: SessionForAuth | null,
  materialId: string,
): Promise<MaterialSummary | null> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const doc = (await (await getDb())
    .collection("material_summaries")
    .findOne({ materialId })) as (SummaryDoc & { _id: unknown }) | null;
  return doc ? toSummary(doc) : null;
}

/** Generate (or regenerate) the summary for one material. */
export async function generateSummary(
  session: SessionForAuth | null,
  materialId: string,
): Promise<MaterialSummary> {
  requireRole(session, ["admin", "teacher", "cr", "student"]);
  const user = session!.user as { id: string; role: string };
  const db = await getDb();

  const material = (await db.collection("materials").findOne({ _id: toObjectId(materialId) })) as
    | { _id: unknown; courseId: string; title: string; textContent?: string; extraction?: { status: string } }
    | null;
  if (!material) throw new AppError("NOT_FOUND", "Material not found.");
  if ((material.extraction?.status ?? "") !== "ok" || !(material.textContent ?? "").trim()) {
    throw new AppError(
      "CONFLICT",
      "This file has no extractable text (e.g. a scanned PDF) — the summarizer needs a text layer.",
    );
  }

  const course = (await db.collection("courses").findOne({ _id: toObjectId(material.courseId) })) as
    | ({ _id: unknown } & CourseRow)
    | null;
  if (!course) throw new AppError("NOT_FOUND", "Course not found.");
  const allowed =
    user.role === "admin" ||
    course.teacherIds.includes(user.id) ||
    ((user.role === "student" || user.role === "cr") && (await isEnrolledIn(course.id, user.id)));
  if (!allowed) {
    throw new AppError("FORBIDDEN", "Only the course's members can generate summaries.");
  }
  if (!aiConfigured()) {
    throw new AiError("AI features are not configured yet — add GEMINI_API_KEY to the environment.", 503);
  }

  // Long materials are truncated for the prompt — the summary is a study aid,
  // not a full re-render (also keeps token bills sane).
  const text = (material.textContent ?? "").slice(0, 24_000);
  const raw = await chat(
    [
      {
        role: "system",
        content:
          "You produce structured study notes from university course material. Answer with ONLY a JSON object: " +
          '{"overview": string, "keyPoints": string[], "definitions": [{"term": string, "meaning": string}], ' +
          '"formulas": string[], "studyQuestions": string[]}. Max 12 items per list, 10 study questions. ' +
          "Formulas in plain text (no LaTeX). Study questions should be exam-style and answerable from the material.",
      },
      { role: "user", content: `Material: "${material.title}"\n\n${text}` },
    ],
    { json: true, maxTokens: 3000 },
  );

  const parsed = SummarySchema.safeParse(extractJson(raw));
  if (!parsed.success) {
    throw new AiError("The AI returned an unusable summary — try again; it usually works on the second attempt.", 502);
  }

  const now = new Date();
  await db.collection("material_summaries").updateOne(
    { materialId },
    {
      $set: {
        materialId,
        courseId: material.courseId,
        summary: parsed.data,
        createdAt: now,
      },
    },
    { upsert: true },
  );
  const saved = (await db
    .collection("material_summaries")
    .findOne({ materialId })) as (SummaryDoc & { _id: unknown }) | null;
  if (!saved) throw new AppError("INTERNAL", "Summary vanished after saving.");
  return toSummary(saved);
}
