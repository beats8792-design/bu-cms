import { NextResponse } from "next/server";
import { getServerSession } from "@/modules/auth/session";
import { requireRole } from "@/modules/auth/rbac";
import { AppError, toErrorBody } from "@/modules/shared/errors";
import { activitiesCsv, allActivities } from "@/modules/admin/activity";
import { atRiskStudents } from "@/modules/admin/analytics";
import { csvCell } from "@/modules/admin/activity";

/**
 * GET /api/admin/reports/[kind] — CSV downloads (UCM-D7).
 * kind = "activity-logs" (who did what) | "at-risk" (UCM-D5 report).
 */

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const session = await getServerSession();
  try {
    requireRole(session, ["admin"]);
    const { kind } = await params;
    const url = new URL(request.url);
    const departmentId = url.searchParams.get("departmentId") ?? undefined;
    const action = url.searchParams.get("action") ?? undefined;
    const search = url.searchParams.get("search") ?? undefined;

    let csv: string;
    if (kind === "activity-logs") {
      csv = activitiesCsv(await allActivities(session, { action, search }));
    } else if (kind === "at-risk") {
      const rows = await atRiskStudents(session, departmentId);
      const head = ["course", "student", "studentId", "section", "attendance %", "threshold", "total", "flags"]
        .map(csvCell)
        .join(",");
      const lines = rows.map((r) =>
        [
          r.courseCode,
          r.name,
          r.studentId,
          r.section,
          r.pct === null ? "" : String(r.pct),
          String(r.threshold),
          r.total === null ? "" : String(r.total),
          [r.flags.lowAttendance ? "low-attendance" : "", r.flags.failing ? "failing" : ""].filter(Boolean).join("+"),
        ]
          .map(csvCell)
          .join(","),
      );
      csv = [head, ...lines].join("\r\n");
    } else {
      throw new AppError("NOT_FOUND", "Unknown report kind.");
    }

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
