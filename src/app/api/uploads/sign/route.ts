import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "@/modules/auth/session";
import { requireRole } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import { loadCourseForMaterials } from "@/modules/materials/service";
import { getDb } from "@/lib/db";
import { signRawUpload, CloudinaryNotConfiguredError } from "@/modules/shared/clients/cloudinary";

/**
 * POST /api/uploads/sign — issues a Cloudinary signature for a browser-direct
 * raw upload. Folder whitelist keeps tenants separated and ties every request
 * to an RBAC check on the referenced resource:
 *   material / assignment-attachment -> course manager (admin or its teacher)
 *   submission / note                -> enrolled student/CR + course managers
 *   library                          -> any signed-in active role (seniors too)
 * Signatures are valid for ~1 hour (Cloudinary default) and scoped to folder
 * + timestamp only.
 */

const BodySchema = z.object({
  kind: z.enum(["material", "assignment-attachment", "submission", "note", "library"]),
  courseId: z
    .string()
    .regex(/^[0-9a-f]{24}$/i, "Valid courseId required")
    .optional(),
  assignmentId: z
    .string()
    .regex(/^[0-9a-f]{24}$/i)
    .optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession();
  try {
    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const { kind, courseId, assignmentId } = parsed.data;
    const db = await getDb();
    const user = session!.user as { id: string; role: string };

    let folder: string;

    if (kind === "library") {
      // UCM-C2: every active signed-in role contributes (seniors = alumni).
      requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
      folder = "ucms/library";
    } else {
      // Everything else is course-scoped and needs a real course.
      if (!courseId) {
        return NextResponse.json({ error: "courseId is required." }, { status: 400 });
      }
      const course = await loadCourseForMaterials(courseId);
      const manager = user.role === "admin" || course.teacherIds.includes(user.id);

      if (kind === "material" || kind === "assignment-attachment") {
        requireRole(session, ["admin", "teacher"]);
        if (!manager) {
          return NextResponse.json(
            { error: "Only teachers of this course can upload here." },
            { status: 403 },
          );
        }
        if (kind === "assignment-attachment" && !assignmentId) {
          return NextResponse.json({ error: "assignmentId is required." }, { status: 400 });
        }
        folder =
          kind === "assignment-attachment"
            ? `ucms/assignments/${assignmentId ?? courseId}`
            : `ucms/materials/${courseId}`;
      } else if (kind === "note") {
        // UCM-C1: enrolled students/CRs + the course's teachers.
        requireRole(session, ["admin", "teacher", "cr", "student"]);
        const enrolled =
          user.role === "admin" ||
          manager ||
          Boolean(
            await db.collection("enrollments").findOne({
              courseId,
              userId: user.id,
              status: "enrolled",
            }),
          );
        if (!enrolled) {
          return NextResponse.json(
            { error: "Enroll in this course to share notes." },
            { status: 403 },
          );
        }
        folder = `ucms/notes/${courseId}`;
      } else {
        // submission: enrolled student/CR of the course.
        requireRole(session, ["student", "cr"]);
        const enrolled = Boolean(
          await db.collection("enrollments").findOne({ courseId, userId: user.id, status: "enrolled" }),
        );
        if (!enrolled) {
          return NextResponse.json(
            { error: "Enroll in this course to upload submissions." },
            { status: 403 },
          );
        }
        if (!assignmentId) {
          return NextResponse.json({ error: "assignmentId is required." }, { status: 400 });
        }
        folder = `ucms/submissions/${assignmentId}`;
      }
    }

    return NextResponse.json(signRawUpload(folder));
  } catch (err) {
    if (err instanceof CloudinaryNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status ?? 400 });
    }
    console.error("[uploads:sign]", err);
    return NextResponse.json({ error: "Could not start the upload." }, { status: 500 });
  }
}
