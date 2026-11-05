import { connection } from "next/server";
import { serverEnv } from "@/lib/env";
import { createMongoClient } from "@/lib/db";

/**
 * GET /api/health — infrastructure readiness for the dashboard & CI.
 * 200 when Mongo is reachable; reports which optional AI/storage services
 * are configured (never leaks keys).
 */

export interface HealthServices {
  cloudinary: boolean;
  gemini: boolean;
  resend: boolean;
}

export interface HealthResult {
  status: "ok" | "degraded" | "down";
  db: boolean;
  services: HealthServices;
}

export async function runHealth(): Promise<HealthResult> {
  let db = false;
  let env;
  let mongoError;
  try {
    env = serverEnv();
    const mongo = await createMongoClient();
    await mongo.db.command({ ping: 1 });
    db = true;
  } catch (err) {
    mongoError = err;
    console.error("[health] db check failed", mongoError);
  }

  const services: HealthServices = env
    ? env.services
    : { cloudinary: false, gemini: false, resend: false };

  return { status: db ? "ok" : "down", db, services };
}

export async function GET(): Promise<Response> {
  await connection(); // never prerender/execute this at build time
  const result = await runHealth();
  const status = result.status === "ok" ? 200 : 503;
  return Response.json(result, { status });
}
