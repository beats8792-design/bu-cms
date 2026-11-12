import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import { AiError, aiConfigured, embed, embeddingModel } from "@/modules/ai/openrouter";
import { chunkText, cosineSimilarity } from "@/modules/ai/schema";
import { toObjectId } from "@/modules/academic/model";

/**
 * RAG infrastructure (ARCHITECTURE.md §6, adapted to OpenRouter):
 * upload (Phase 3) → chunkText → embeddings via /api/v1/embeddings →
 * `material_chunks` → retrieval = embed the question, brute-force cosine in
 * RAM over the course's chunks, top-k. A course has hundreds to a few
 * thousand chunks — no vector database needed at v1 scale.
 *
 * Chunks store the embedding model they were built with; retrieval only ever
 * compares vectors from the same model, so switching OPENROUTER_EMBEDDING_MODEL
 * degrades to "needs reindexing" instead of dimension-mismatch crashes.
 */

interface ChunkDoc {
  _id: unknown;
  materialId: string;
  courseId: string;
  order: number;
  text: string;
  embedding: number[];
  embeddingModel: string;
  createdAt: Date;
}

export interface RetrievedChunk {
  materialId: string;
  materialTitle: string;
  order: number;
  text: string;
  score: number;
}

/* ----------------------------------------------------------------- indexing */

/** Index (or re-index) one material from its extracted text. */
export async function indexMaterial(materialId: string): Promise<number> {
  const db = await getDb();
  const material = (await db.collection("materials").findOne({ _id: toObjectId(materialId) })) as
    | { _id: unknown; courseId: string; title: string; textContent?: string; extraction?: { status: string } }
    | null;
  if (!material) throw new AppError("NOT_FOUND", "Material not found.");
  if (!aiConfigured()) {
    throw new AiError("AI features are not configured yet — add OPENROUTER_API_KEY to the environment.", 503);
  }

  const chunks = chunkText(material.textContent ?? "");
  await db.collection("material_chunks").deleteMany({ materialId: String(material._id) });
  if (chunks.length === 0) return 0;

  // Embed in modest batches — keeps request bodies well under API limits.
  const model = embeddingModel();
  const inserted: ChunkDoc[] = [];
  for (let i = 0; i < chunks.length; i += 32) {
    const batch = chunks.slice(i, i + 32);
    const vectors = await embed(batch);
    for (let j = 0; j < batch.length; j++) {
      inserted.push({
        _id: null,
        materialId: String(material._id),
        courseId: material.courseId,
        order: i + j,
        text: batch[j],
        embedding: vectors[j],
        embeddingModel: model,
        createdAt: new Date(),
      });
    }
  }
  await db.collection("material_chunks").insertMany(inserted as never[]);
  return inserted.length;
}

/**
 * Index every extracted material of a course (managers do this once after
 * enabling AI, or after changing the embedding model). Skips materials with
 * no usable text; returns {indexed, chunks}.
 */
export async function indexCourse(courseId: string): Promise<{ indexed: number; chunks: number }> {
  const db = await getDb();
  const materials = (await db
    .collection("materials")
    .find(
      { courseId, hidden: false, "extraction.status": "ok" },
      { projection: { _id: 1 } },
    )
    .toArray()) as unknown as Array<{ _id: unknown }>;

  let indexed = 0;
  let chunks = 0;
  for (const m of materials) {
    try {
      chunks += await indexMaterial(String(m._id));
      indexed++;
    } catch (err) {
      // One bad material must not sink the whole reindex.
      console.error("[rag:indexCourse] material failed", String(m._id), err);
    }
  }
  return { indexed, chunks };
}

export async function courseChunkCount(courseId: string): Promise<number> {
  return (await (await getDb()).collection("material_chunks").countDocuments({ courseId })) as number;
}

/* ---------------------------------------------------------------- retrieval */

/**
 * Top-k chunks for a question within one course. Only chunks sharing the
 * current embedding model are comparable (mixed-model courses after a model
 * switch are simply not matched until reindexed).
 */
export async function retrieve(
  courseId: string,
  question: string,
  k = 6,
): Promise<RetrievedChunk[]> {
  const db = await getDb();
  const docs = (await db
    .collection("material_chunks")
    .find({ courseId, embeddingModel: embeddingModel() })
    .toArray()) as unknown as (ChunkDoc & { _id: unknown })[];
  if (docs.length === 0) return [];

  const [qVector] = await embed([question]);
  const materialIds = [...new Set(docs.map((d) => d.materialId))];
  const materials = (await db
    .collection("materials")
    .find({ _id: { $in: materialIds as never[] } }, { projection: { title: 1 } })
    .toArray()) as unknown as Array<{ _id: string; title: string }>;
  const titleById = new Map(materials.map((m) => [String(m._id), m.title]));

  return docs
    .map((d) => ({
      materialId: d.materialId,
      materialTitle: titleById.get(d.materialId) ?? "Material",
      order: d.order,
      text: d.text,
      score: cosineSimilarity(qVector, d.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export async function reindexCourse(
  session: SessionForAuth | null,
  courseId: string,
): Promise<{ indexed: number; chunks: number }> {
  requireRole(session, ["admin", "teacher"]);
  return indexCourse(courseId);
}
