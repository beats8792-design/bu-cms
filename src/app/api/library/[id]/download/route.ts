import { NextResponse } from "next/server";
import { getServerSession } from "@/modules/auth/session";
import { AppError } from "@/modules/shared/errors";
import { resourceDownload } from "@/modules/collab/library";
import { CloudinaryNotConfiguredError } from "@/modules/shared/clients/cloudinary";

/**
 * GET /api/library/[id]/download — any signed-in active role + capped
 * download tracking + 302 to the Cloudinary `fl_attachment` delivery URL.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  try {
    const { id } = await params;
    const redirectUrl = await resourceDownload(session ?? null, id);
    return NextResponse.redirect(redirectUrl, 302);
  } catch (err) {
    if (err instanceof CloudinaryNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[library:download]", err);
    return NextResponse.json({ error: "Download failed." }, { status: 500 });
  }
}
