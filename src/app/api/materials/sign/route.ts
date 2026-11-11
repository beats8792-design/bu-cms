import { NextResponse } from "next/server";
import { getServerSession } from "@/modules/auth/session";
import { requireRole } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import { loadCourseForMaterials } from "@/modules/materials/service";
import { signRawUpload, CloudinaryNotConfiguredError } from "@/modules/shared/clients/cloudinary";

/**
 * POST /api/materials/sign — issues a short-lived Cloudinary signature so the
 * browser can upload the file directly (30 MB would be wasteful through the
 * serverless function). Only course managers may request one.
 */
export async function POST(request: Request) {
  const session = await getServerSession();
  try {
    requireRole(session, ["admin", "teacher"]);

    const body = (await request.json()) as { courseId?: string };
    if (!body.courseId) {
      return NextResponse.json({ error: "courseId is required." }, { status: 400 });
    }

    const course = await loadCourseForMaterials(body.courseId);
    const user = session!.user as { id: string; role: string };
    if (user.role !== "admin" && !course.teacherIds.includes(user.id)) {
      return NextResponse.json(
        { error: "Only teachers of this course can upload materials." },
        { status: 403 },
      );
    }

    const signed = signRawUpload(`ucms/materials/${body.courseId}`);
    return NextResponse.json(signed);
  } catch (err) {
    if (err instanceof CloudinaryNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status ?? 400 });
    }
    return NextResponse.json(
      { error: "Could not start the upload. Please try again." },
      { status: 500 },
    );
  }
}
