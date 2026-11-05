import { getAuth } from "@/modules/auth/server";

/**
 * BetterAuth catch-all. getAuth lazily connects Mongo, then hands the
 * request to the adapter-backed handler.
 */

async function handle(request: Request): Promise<Response> {
  return (await getAuth()).handler(request);
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
