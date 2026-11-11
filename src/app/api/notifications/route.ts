import { NextResponse } from "next/server";
import { getServerSession } from "@/modules/auth/session";
import { AppError } from "@/modules/shared/errors";
import { listMine, markRead } from "@/modules/notifications/service";

/** GET /api/notifications — latest items + unread count (bell polls every 60s). */
export async function GET() {
  const session = await getServerSession();
  try {
    return NextResponse.json(await listMine(session ?? null, { limit: 30 }));
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[notifications:list]", err);
    return NextResponse.json({ error: "Could not load notifications." }, { status: 500 });
  }
}

/** POST /api/notifications — mark read: `{ids: [...]}` or `{all: true}`. */
export async function POST(request: Request) {
  const session = await getServerSession();
  try {
    const body = await request.json();
    const modified = await markRead(session ?? null, body);
    return NextResponse.json({ modified });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[notifications:markRead]", err);
    return NextResponse.json({ error: "Could not update notifications." }, { status: 500 });
  }
}
