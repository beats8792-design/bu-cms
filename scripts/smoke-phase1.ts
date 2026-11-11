import { config } from "dotenv";
config({ path: ".env.local" });
import { hashPassword } from "better-auth/crypto";
import { createMongoClient } from "@/lib/db";
import { getAuth } from "@/modules/auth/server";
import {
  importUsers,
  markEmailVerified,
  setUserRole,
  transitionUser,
  nextStatus,
} from "@/modules/admin/users";
import { AppError } from "@/modules/shared/errors";

/**
 * Phase 1 runtime smoke (only makes sense while `npm run dev` is up):
 *   tsx scripts/smoke-phase1.ts <ADMIN_EMAIL> <ADMIN_TEMP_PASSWORD>
 *
 * Exercises: public signup --> pending (hook), admin sign-in over HTTP,
 * real session through auth.api.getSession, admin services, RBAC negatives.
 * Cleans up every row it creates (except the admin account).
 */

const BASE = "http://localhost:3000";
const ADMIN_EMAIL = process.argv[2];
const ADMIN_PASSWORD = process.argv[3];
const SMOKE_EMAIL = "ucms-smoke+phase1@jazbah.test";
const SMOKE_PASSWORD = "SmokeOnly#2233";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  const tag = ok ? "PASS" : "FAIL";
  if (!ok) failures++;
  console.log(`${tag}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const { client, db } = await createMongoClient();
  const auth = await getAuth();

  try {
    /* 0. Set the admin credential to the given temp password --------------- */
    const adminUser = (await db.collection("user").findOne({ email: ADMIN_EMAIL })) as
      | { _id: string }
      | null;
    if (!adminUser) throw new Error(`Admin ${ADMIN_EMAIL} not found — run \`npm run adm -- ${ADMIN_EMAIL}\` first`);
    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    await db.collection("account").updateOne(
      { userId: String(adminUser._id), providerId: "credential" },
      { $set: { passwordHash } },
    );
    /* 1. Public signup endpoint lands pending + student --------------------- */
    const sigRes = await fetch(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Smoke Test", email: SMOKE_EMAIL, password: SMOKE_PASSWORD }),
    }).then((r) => ({ status: r.status }));
    // Endpoint may 500 if the Resend verification send fails for fake domains;
    // the invariant we care about is the DB state.
    const smokeUser = (await db.collection("user").findOne({ email: SMOKE_EMAIL }))
    check(
      "public signup creates user with status=pending, role=student",
      smokeUser !== null && smokeUser.status === "pending" && smokeUser.role === "student",
      `signup HTTP ${sigRes.status}, db status=${smokeUser?.status}, role=${smokeUser?.role}`,
    );

    /* 2. Unverified user cannot sign in ------------------------------------ */
    const smokeSignIn = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD }),
    });
    check("unverified user cannot sign in", smokeSignIn.status !== 200, `HTTP ${smokeSignIn.status}`);

    /* 3. Admin sign-in over HTTP ------------------------------------------- */
    const adminRes = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const setCookie = adminRes.headers.get("set-cookie") ?? "";
    check("admin signs in over HTTP", adminRes.status === 200 && setCookie.includes("better-auth"), `HTTP ${adminRes.status}`);
    if (!setCookie) throw new Error("no session cookie — cannot continue");

    const cookieHeader = setCookie
      .split(/,(?=[^;]+?=)/)
      .map((c) => c.split(";")[0].trim())
      .join("; ");

    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader }) });
    const sessionUser = session?.user as { id?: string; role?: string; email?: string } | undefined;
    check(
      "getSession resolves admin role from cookie",
      sessionUser?.role === "admin" && sessionUser?.email === ADMIN_EMAIL,
      `role=${sessionUser?.role}`,
    );

    /* 4. Negative RBAC ------------------------------------------------------ */
    let blockedAsExpected = false;
    try {
      await transitionUser(null, SMOKE_EMAIL, "approve");
    } catch (err) {
      blockedAsExpected = err instanceof AppError && err.code === "UNAUTHORIZED";
    }
    check("null session is rejected (UNAUTHORIZED)", blockedAsExpected);

    let blockedStudent = false;
    try {
      await transitionUser({ user: { id: "x", role: "student" } }, SMOKE_EMAIL, "approve");
    } catch (err) {
      blockedStudent = err instanceof AppError && err.code === "FORBIDDEN";
    }
    check("student session is rejected (FORBIDDEN)", blockedStudent);

    /* 5. Admin services against the real session --------------------------- */
    await transitionUser(session, SMOKE_EMAIL, "approve");
    const approved = (await db.collection("user").findOne({ email: SMOKE_EMAIL })) as { status: string } | null;
    check("approve: pending -> active", approved?.status === "active");

    await setUserRole(session, SMOKE_EMAIL, "teacher");
    const reRole = (await db.collection("user").findOne({ email: SMOKE_EMAIL })) as { role: string } | null;
    check("setUserRole: student -> teacher", reRole?.role === "teacher");

    await markEmailVerified(session, SMOKE_EMAIL);
    const verified = (await db.collection("user").findOne({ email: SMOKE_EMAIL })) as { emailVerified: boolean } | null;
    check("markEmailVerified", verified?.emailVerified === true);

    const summary = await importUsers(session, [
      { index: 1, name: "Import One", email: "ucms-import-1@jazbah.test", role: "student", studentId: "2021-001" },
      { index: 2, name: "Import Two", email: "ucms-import-2@jazbah.test", role: "teacher", studentId: "" },
      { index: 3, name: "Already Here", email: "ucms-import-1@jazbah.test", role: "student", studentId: "" },
    ]);
    check(
      "importUsers: 2 imported, 1 existing skipped, all pending",
      summary.imported === 2 && summary.existing === 1,
      JSON.stringify({ imported: summary.imported, existing: summary.existing }),
    );
    const importedOne = (await db.collection("user").findOne({ email: "ucms-import-1@jazbah.test" })) as { status: string } | null;
    check("imported accounts start pending", importedOne?.status === "pending");

    // Last-admin protection
    let lastAdminBlocked = false;
    try {
      await transitionUser(session, ADMIN_EMAIL, "suspend");
    } catch (err) {
      lastAdminBlocked = err instanceof AppError && err.code === "CONFLICT";
    }
    check("last active admin cannot be suspended", lastAdminBlocked);

    // Self-demotion protection
    let selfDemoteBlocked = false;
    try {
      await setUserRole(session, ADMIN_EMAIL, "student");
    } catch (err) {
      selfDemoteBlocked = err instanceof AppError && err.code === "CONFLICT";
    }
    check("admin cannot change own role out of admin", selfDemoteBlocked);

    const adminAfter = (await db.collection("user").findOne({ email: ADMIN_EMAIL })) as {
      role: string; status: string;
    } | null;
    check("admin account intact at the end", adminAfter?.role === "admin" && adminAfter?.status === "active");

    /* cleanup -------------------------------------------------------------- */
    const testEmails = [SMOKE_EMAIL, "ucms-import-1@jazbah.test", "ucms-import-2@jazbah.test"];
    const testUsers = (
      (await db.collection("user").find({ email: { $in: testEmails } }).toArray()) as unknown as {
        _id: unknown;
      }[]
    ).map((u) => String(u._id));
    await db.collection("account").deleteMany({ userId: { $in: testUsers } });
    const delUsers = await db.collection("user").deleteMany({ email: { $in: testEmails } });
    const delSess = await db.collection("session").deleteMany({ userId: { $in: testUsers } });
    void delSess;
    console.log(`cleanup removed ${delUsers.deletedCount} test users`);
    void nextStatus;
  } finally {
    // Touch auth once so the auth client is initialized before process exit (idempotent).
    void auth;
    await client.close();
  }

  console.log(failures === 0 ? "\nSMOKE: ALL PASSED" : `\nSMOKE: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
