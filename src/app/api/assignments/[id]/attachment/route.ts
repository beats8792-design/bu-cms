import { NextResponse } from "next/server";
import { getServerSession } from "@/modules/auth/session";
import { requireRole } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import { getAssignment } from "@/modules/assignments/service";
import { materialDeliveryUrl, CloudinaryNotConfiguredError } from "@/modules/shared/clients/cloudinary";

/**
 * GET /api/assignments/[id]/attachment?p=<publicId> — assignment attachments.
 * Access: course manager, enrolled student/CR, or alumni (read-only).
 * The publicId must belong to the assignment's attachment list.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  try {
    requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
    const { id } = await params;
    const publicId = new URL(request.url).searchParams.get("p") ?? "";

    const assignment = await getAssignment(session, id);
    const attachment = assignment.attachments.find((a) => a.publicId === publicId);
    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    }

    // Enrollment check for students/CRs (managers + alumni pass by role).
    const user = session!.user as { id: string; role: string };
    if (user.role === "student" || user.role === "cr") {
      const { getDb } = await import("@/lib/db");
      const db = await getDb();
      const enrolled = await db.collection("enrollments").findOne({
        courseId: assignment.courseId,
        userId: user.id,
        status: "enrolled",
      });
      if (!enrolled) {
        return NextResponse.json(
          { error: "Enroll in this course to download attachments." },
          { status: 403 },
        );
      }
    }

    const safeName = attachment.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
    return NextResponse.redirect(materialDeliveryUrl(publicId, safeName), 302);
  } catch (err) {
    if (err instanceof CloudinaryNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[assignments:attachment]", err);
    return NextResponse.json({ error: "Download failed." }, { status: 500 });
  }
}
