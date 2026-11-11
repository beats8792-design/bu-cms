import { NextResponse } from "next/server";
import { getServerSession } from "@/modules/auth/session";
import { AppError } from "@/modules/shared/errors";
import { registerDownload } from "@/modules/materials/service";
import { materialDeliveryUrl } from "@/modules/shared/clients/cloudinary";
import { toObjectId } from "@/modules/academic/model";
import { getDb } from "@/lib/db";

/**
 * GET /api/materials/[id]/download — RBAC check + download-count entry, then a
 * 302 to the Cloudinary delivery URL (fl_attachment keeps the original name).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  try {
    const { id } = await params;
    if (!/^[0-9a-f]{24}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid material id." }, { status: 400 });
    }

    const db = await getDb();
    const doc = (await db
      .collection("materials")
      .findOne({ _id: toObjectId(id) }, { projection: { cloudinaryPublicId: 1, title: 1, fileType: 1 } })) as
      | { cloudinaryPublicId: string; title: string; fileType: string }
      | null;
    if (!doc) return NextResponse.json({ error: "Material not found." }, { status: 404 });

    await registerDownload(session, id);

    const fileName = `${doc.title.replace(/\s+/g, "_").slice(0, 80)}.${doc.fileType}`;
    return NextResponse.redirect(materialDeliveryUrl(doc.cloudinaryPublicId, fileName), 302);
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[materials:download]", err);
    return NextResponse.json({ error: "Download failed. Please try again." }, { status: 500 });
  }
}
