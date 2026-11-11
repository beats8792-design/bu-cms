import { z } from "zod";
import { AppError } from "@/modules/shared/errors";

/**
 * Materials contracts + pure policies (Phase 3, UCM-F8).
 * Files live on Cloudinary (raw uploads); Mongo stores metadata + the
 * extracted text layer that Phase 9's RAG will chunk.
 */

export const MAX_MATERIAL_BYTES = 30 * 1024 * 1024; // 30 MB (PRD UCM-F8)

/** Extension -> expected MIME-ish label. Cloudinary raw uploads have no MIME. */
export const ALLOWED_FILE_TYPES = {
  pdf: "PDF document",
  docx: "Word document",
  pptx: "PowerPoint presentation",
  zip: "ZIP archive",
} as const;

export type FileType = keyof typeof ALLOWED_FILE_TYPES;

export function isFileType(value: unknown): value is FileType {
  return typeof value === "string" && value in ALLOWED_FILE_TYPES;
}

export const MaterialSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(2).max(200),
  topic: z.string().trim().max(80).default("General"),
  description: z.string().trim().max(2000).default(""),
  cloudinaryPublicId: z.string().trim().min(3).max(400),
  fileType: z.custom<FileType>((v) => isFileType(v), "Unsupported file type"),
  size: z.number().int().min(1).max(MAX_MATERIAL_BYTES, "File too large (max 30 MB)"),
});

export type MaterialInput = z.infer<typeof MaterialSchema>;

export interface Material {
  id: string;
  courseId: string;
  uploaderId: string;
  title: string;
  topic: string;
  description: string;
  cloudinaryPublicId: string;
  fileType: FileType;
  size: number;
  hidden: boolean;
  downloadCount: number;
  extraction: { status: "pending" | "ok" | "empty" | "failed"; message: string };
  createdAt: string;
}

export type UploadMeta = { fileType: string; size: number; fileName: string };

export type UploadDecision = { ok: true; fileType: FileType } | { ok: false; reason: string };

/** Pure upload gate: extension whitelist + size cap. */
export function canUpload(meta: UploadMeta): UploadDecision {
  const ext = (meta.fileName.split(".").pop() ?? "").toLowerCase();
  if (!isFileType(ext)) {
    const allowed = Object.keys(ALLOWED_FILE_TYPES).join(", ");
    return { ok: false, reason: `Unsupported file type. Allowed: ${allowed}.` };
  }
  if (meta.size <= 0) {
    return { ok: false, reason: "The file looks empty." };
  }
  if (meta.size > MAX_MATERIAL_BYTES) {
    return { ok: false, reason: "File too large (max 30 MB)." };
  }
  return { ok: true, fileType: ext };
}

/** Topics are free-form but stable: trimmed, first-letter capped, default. */
export function normalizeTopic(topic: string | undefined): string {
  const t = (topic ?? "").trim();
  if (!t) return "General";
  return t.slice(0, 80);
}

/** Group materials by topic, preserving alphabetical topic order (UI). */
export function groupByTopic<T extends { topic: string; title: string }>(
  materials: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const m of materials) {
    const key = m.topic || "General";
    const list = map.get(key) ?? [];
    list.push(m);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.title.localeCompare(b.title));
  }
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function materialValidationError(message: string): AppError {
  return new AppError("VALIDATION_FAILED", message);
}
