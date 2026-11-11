import { NextResponse } from "next/server";
import { getServerSession } from "@/modules/auth/session";
import { AppError } from "@/modules/shared/errors";
import { teacherDashboard, submissionFileUrls } from "@/modules/assignments/service";

/**
 * GET /api/assignments/[id]/download-all — teacher/admin one-tab zip of every
 * submission file (UCM-F14). Files are fetched from Cloudinary and zipped
 * in-memory (a class has dozens of submissions, not thousands).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  try {
    const { id } = await params;
    const { assignment, rows } = await teacherDashboard(session ?? null, id);
    void rows;
    const files = await submissionFileUrls(id);
    if (files.length === 0) {
      return NextResponse.json({ error: "No submissions to download yet." }, { status: 404 });
    }

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    // Fetch sequentially-ish with a small concurrency pool to stay polite.
    const results = await Promise.allSettled(
      files.map(async (f) => {
        const res = await fetch(f.url);
        if (!res.ok) throw new Error(`${f.fileName}: HTTP ${res.status}`);
        return { fileName: f.fileName, buffer: Buffer.from(await res.arrayBuffer()) };
      }),
    );
    let failures = 0;
    for (const r of results) {
      if (r.status === "fulfilled") zip.file(r.value.fileName, r.value.buffer);
      else failures++;
    }

    const content = await zip.generateAsync({ type: "nodebuffer" });
    const fileName = `submissions-${assignment.title.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 60)}.zip`;
    return new NextResponse(new Uint8Array(content), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        ...(failures > 0 ? { "X-Missing-Files": String(failures) } : {}),
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[assignments:download-all]", err);
    return NextResponse.json({ error: "Download-all failed." }, { status: 500 });
  }
}
