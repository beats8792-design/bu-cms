import { AppError } from "@/modules/shared/errors";
import type { FileType } from "@/modules/materials/schema";

/**
 * Server-side text extraction (ARCHITECTURE.md §6 step 1).
 * PDF = pdf-parse, DOCX = mammoth, PPTX = JSZip + XML scrape (no text-layer
 * guarantee). ZIP archives are stored but never extracted.
 * Output feeds the hidden `textContent` field that Phase 9 chunking consumes.
 */

export type ExtractionResult =
  | { status: "ok"; text: string }
  | { status: "empty"; message: string }
  | { status: "failed"; message: string };

const MAX_TEXT_CHARS = 300_000;

type PdfParseFn = (buffer: Buffer) => Promise<{ text: string }>;

// pdf-parse's index.js has a debug branch that runs when it is the entry
// module; importing the lib file directly avoids it (ESM has no module.parent).
// Loaded lazily so page prerender never pulls pdf.js into the build worker.
async function loadPdfParse(): Promise<PdfParseFn> {
  const mod = (await import("pdf-parse/lib/pdf-parse.js")) as { default: PdfParseFn };
  return mod.default;
}

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const pdfParse = await loadPdfParse();
    const pdf = await pdfParse(buffer);
    const text = (pdf.text ?? "").trim();
    if (text.length < 20) {
      // Scanned PDFs have no text layer — PRD requires a clear message.
      return {
        status: "empty",
        message:
          "No text layer found — this PDF looks scanned. Students can still download it, but AI tools won't be able to use it.",
      };
    }
    return { status: "ok", text: text.slice(0, MAX_TEXT_CHARS) };
  } catch (err) {
    console.error("[extract:pdf]", err);
    return { status: "failed", message: "This PDF could not be parsed." };
  }
}

async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer });
    const text = value.trim();
    if (text.length < 20) return { status: "empty", message: "The document appears to contain no text." };
    return { status: "ok", text: text.slice(0, MAX_TEXT_CHARS) };
  } catch (err) {
    console.error("[extract:docx]", err);
    return { status: "failed", message: "This Word document could not be parsed." };
  }
}

async function extractPptx(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => slideNo(a) - slideNo(b));
    if (slideFiles.length === 0) {
      return { status: "empty", message: "No slides found in this presentation." };
    }
    let text = "";
    for (const name of slideFiles) {
      const xml = await zip.files[name].async("string");
      text += xml.replace(/<a:t>([^<]*)<\/a:t>/g, "$1\n").replace(/<[^>]+>/g, " ") + "\n";
    }
    text = text.replace(/[ \t]+/g, " ").trim();
    if (text.length < 20) {
      return {
        status: "empty",
        message: "Slides contain no extractable text (images only?) — downloads still work.",
      };
    }
    return { status: "ok", text: text.slice(0, MAX_TEXT_CHARS) };
  } catch (err) {
    console.error("[extract:pptx]", err);
    return { status: "failed", message: "This presentation could not be parsed." };
  }
}

function slideNo(path: string): number {
  return Number(path.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
}

export async function extractText(buffer: Buffer, fileType: FileType): Promise<ExtractionResult> {
  switch (fileType) {
    case "pdf":
      return extractPdf(buffer);
    case "docx":
      return extractDocx(buffer);
    case "pptx":
      return extractPptx(buffer);
    case "zip":
      return { status: "empty", message: "Archives are stored as-is and not indexed for AI tools." };
    default: {
      // Exhaustive guard — a new FileType must be handled here.
      const never: never = fileType;
      throw new AppError("INTERNAL", `Unhandled file type ${String(never)}`);
    }
  }
}

/** Fetches the uploaded file from Cloudinary for server-side processing. */
export async function fetchMaterialBytes(publicId: string): Promise<Buffer> {
  const { serverEnv } = await import("@/lib/env");
  const env = serverEnv();
  if (!env.services.cloudinary) throw new AppError("INTERNAL", "Cloudinary not configured.");
  const url = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/raw/upload/${publicId}`;
  const res = await fetch(url);
  if (!res.ok) throw new AppError("NOT_FOUND", "Uploaded file could not be fetched for processing.");
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
