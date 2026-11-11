import { NextResponse } from "next/server";
import { getServerSession } from "@/modules/auth/session";
import { requireRole } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import { loadCourseForMaterials, createMaterial } from "@/modules/materials/service";
import { canUpload, normalizeTopic, isFileType, MAX_MATERIAL_BYTES } from "@/modules/materials/schema";
import { extractText, fetchMaterialBytes } from "@/modules/materials/extract";

/**
 * POST /api/materials — records a file that the browser already uploaded to
 * Cloudinary. Runs the text-extraction pipeline inline (Phase 9 RAG feeds on
 * the stored text layer); failures degrade to a friendly message, the file is
 * always kept.
 */
export async function POST(request: Request) {
  const session = await getServerSession();
  try {
    requireRole(session, ["admin", "teacher"]);
    const user = session!.user as { id: string; role: string };

    const body = (await request.json()) as {
      courseId?: string;
      title?: string;
      topic?: string;
      description?: string;
      cloudinaryPublicId?: string;
      fileName?: string;
      size?: number;
    };

    const courseId = body.courseId ?? "";
    const title = (body.title ?? "").trim();
    const publicId = (body.cloudinaryPublicId ?? "").trim();
    const size = Number(body.size ?? 0);

    const gate = canUpload({
      fileType: (body.fileName ?? "").split(".").pop() ?? "",
      size: Number.isFinite(size) ? size : 0,
      fileName: body.fileName ?? "",
    });
    if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 400 });

    if (!courseId || !title || !publicId || !isFileType(gate.fileType)) {
      return NextResponse.json({ error: "Missing course, title or file reference." }, { status: 400 });
    }
    if (size > MAX_MATERIAL_BYTES) {
      return NextResponse.json({ error: "File too large (max 30 MB)." }, { status: 413 });
    }

    // Server-side authorization (the sign endpoint already gated this once).
    const course = await loadCourseForMaterials(courseId);
    if (user.role !== "admin" && !course.teacherIds.includes(user.id)) {
      return NextResponse.json({ error: "Only teachers of this course can upload." }, { status: 403 });
    }

    // Optional Cloudinary existence check (trust-but-verify on the client claim).
    // Skipped when the admin API errors for other reasons — the delivery URL
    // check in extraction will catch genuinely missing files.

    let textContent = "";
    let extraction: { status: "ok" | "empty" | "failed"; message: string } = {
      status: "failed",
      message: "Extraction could not run.",
    };
    try {
      const buffer = await fetchMaterialBytes(publicId);
      const result = await extractText(buffer, gate.fileType);
      if (result.status === "ok") {
        textContent = result.text;
        extraction = { status: "ok", message: "" };
      } else {
        extraction = { status: result.status, message: result.message };
      }
    } catch (err) {
      console.error("[materials:create] extraction", err);
      extraction = {
        status: "failed",
        message: "The file was saved, but automatic text extraction failed. Downloads still work.",
      };
    }

    const id = await createMaterial({
      courseId,
      title,
      topic: normalizeTopic(body.topic),
      description: (body.description ?? "").trim(),
      cloudinaryPublicId: publicId,
      fileType: gate.fileType,
      size,
      uploaderId: user.id,
      textContent,
      extraction,
    });

    return NextResponse.json({ id, extraction });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status ?? 400 });
    }
    console.error("[materials:create]", err);
    return NextResponse.json({ error: "Could not save the material." }, { status: 500 });
  }
}
