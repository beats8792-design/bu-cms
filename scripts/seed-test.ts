import { config } from "dotenv";
config({ path: ".env.local" });
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { ObjectId } from "mongodb";
import { createMongoClient } from "@/lib/db";
import { ensureIndexes } from "@/modules/shared/ensure-indexes";

/**
 * `npm run seed:test` — simple test accounts for manual testing (owner request,
 * 2026-11-15): admin/teacher/cr/student/alumni @gmail.com, shared password
 * `test1234`, all active + emailVerified, created directly with the verified
 * BetterAuth v1.7.17 mongo-adapter account shape (userId = ObjectId,
 * accountId = user id hex string, hash under the `password` key).
 *
 * They are wired into the existing demo dataset: teacher joins the demo
 * courses, student + CR are enrolled (with marks + attendance history), alumni
 * stays unenrolled (library/groups only). Idempotent: every step is an upsert.
 */

const TEST_PASSWORD = "test1234";

interface TestUser {
  email: string;
  name: string;
  role: "admin" | "teacher" | "student" | "cr" | "alumni";
  studentId?: string;
}

const people: TestUser[] = [
  { email: "admin@gmail.com", name: "Test Admin", role: "admin" },
  { email: "teacher@gmail.com", name: "Test Teacher", role: "teacher" },
  { email: "cr@gmail.com", name: "Test CR", role: "cr", studentId: "2101998" },
  { email: "student@gmail.com", name: "Test Student", role: "student", studentId: "2101999" },
  { email: "alumni@gmail.com", name: "Test Alumni", role: "alumni" },
];

async function main(): Promise<void> {
  const { client, db } = await createMongoClient();
  try {
    await ensureIndexes(db);
    const now = new Date();

    const dept = (await db.collection("departments").findOne({ code: "CSE" })) as
      | { _id: ObjectId }
      | null;
    if (!dept) throw new Error("CSE department not found — run `npm run seed` first.");
    const departmentId = dept._id.toString();

    /* --------------------------------------------------------------- users */
    const users = db.collection("user");
    const accounts = db.collection("account");
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const ids = new Map<string, string>();

    for (const p of people) {
      const existing = (await users.findOne({ email: p.email })) as
        | { _id: ObjectId }
        | null;
      if (existing) {
        ids.set(p.email, existing._id.toString());
        console.log(`exists   ${p.role.padEnd(7)} ${p.email}`);
        continue;
      }
      const _id = new ObjectId();
      await users.insertOne({
        _id,
        name: p.name,
        email: p.email,
        emailVerified: true,
        role: p.role,
        status: "active",
        displayName: p.name,
        departmentId,
        studentId: p.studentId ?? "",
        createdAt: now,
        updatedAt: now,
      });
      await accounts.insertOne({
        userId: _id, // ObjectId — the mongo adapter coerces id/reference fields
        providerId: "credential",
        accountId: _id.toString(), // v1.7 sign-in matches accountId === user.id
        password: passwordHash, // hash lives under the DB key `password`
        createdAt: now,
        updatedAt: now,
      });
      ids.set(p.email, _id.toString());
      console.log(`created  ${p.role.padEnd(7)} ${p.email}`);
    }

    const teacherId = ids.get("teacher@gmail.com")!;
    const studentId = ids.get("student@gmail.com")!;
    const crId = ids.get("cr@gmail.com")!;

    /* ------------------------------------------------- teacher joins courses */
    const courses = (await db
      .collection("courses")
      .find({ code: { $in: ["CSE-101", "CSE-205", "CSE-310"] } })
      .toArray()) as unknown as Array<{ _id: ObjectId; code: string; teacherIds: string[] }>;
    for (const c of courses) {
      if (!c.teacherIds.includes(teacherId)) {
        await db
          .collection("courses")
          .updateOne({ _id: c._id }, { $addToSet: { teacherIds: teacherId } });
        console.log(`teacher added to course ${c.code}`);
      }
    }
    const courseId = new Map(courses.map((c) => [c.code, c._id.toString()]));
    if (courseId.size === 0) throw new Error("No demo courses found — run `npm run seed` first.");

    /* ------------------------------------------------------------ enrollments */
    const enroll = async (code: string, userId: string): Promise<void> => {
      const cid = courseId.get(code)!;
      await db.collection("enrollments").updateOne(
        { courseId: cid, userId },
        {
          $set: { status: "enrolled", section: "A", enrolledAt: now },
          $setOnInsert: { courseId: cid, userId },
        },
        { upsert: true },
      );
    };
    await enroll("CSE-101", studentId);
    await enroll("CSE-205", studentId);
    await enroll("CSE-310", studentId);
    await enroll("CSE-101", crId);
    await enroll("CSE-205", crId);
    console.log("enrolled: student in CSE-101/205/310, CR in CSE-101/205");

    /* ------------------------------------ attendance history in CSE-101 sessions */
    const cse101 = courseId.get("CSE-101")!;
    const sessions = (await db
      .collection("attendance_sessions")
      .find({ courseId: cse101, status: "closed" })
      .sort({ date: 1 })
      .toArray()) as unknown as Array<{ _id: ObjectId; date: string }>;
    for (const s of sessions) {
      const sid = s._id.toString();
      for (const [userId, statuses] of [
        [studentId, ["present", "present", "late"]],
        [crId, ["present", "present", "present"]],
      ] as Array<[string, string[]]>) {
        const idx = Math.min(sessions.indexOf(s), statuses.length - 1);
        await db.collection("attendance_records").updateOne(
          { sessionId: sid, userId },
          {
            $set: { status: statuses[idx], markedAt: now },
            $setOnInsert: { sessionId: sid, userId },
          },
          { upsert: true },
        );
      }
    }
    console.log(`attendance records added in ${sessions.length} closed CSE-101 session(s)`);

    /* ----------------------------------------------------- marks for CSE-101 */
    const schema = (await db
      .collection("assessment_schemas")
      .findOne({ courseId: cse101 })) as { components: Array<{ key: string }> } | null;
    if (schema) {
      const plan: Array<[string, Record<string, number>]> = [
        [studentId, { ct1: 15, ct2: 14, mid: 22, final: 35 }],
        [crId, { ct1: 13, ct2: 12, mid: 18, final: 30 }],
      ];
      for (const [uid, scores] of plan) {
        for (const c of schema.components) {
          const score = scores[c.key];
          if (score === undefined) continue;
          await db.collection("marks").updateOne(
            { courseId: cse101, userId: uid, componentKey: c.key },
            {
              $set: { score, updatedBy: teacherId, updatedAt: now },
              $setOnInsert: { history: [] },
            },
            { upsert: true },
          );
        }
      }
      console.log("marks seeded for CSE-101 (test student + CR)");
    }

    /* ------------------------------------------------------------ verification */
    let ok = true;
    for (const p of people) {
      const uid = ids.get(p.email)!;
      const acct = (await accounts.findOne({ providerId: "credential", accountId: uid })) as
        | { userId: ObjectId; password?: string }
        | null;
      const valid =
        acct !== null &&
        acct.userId instanceof ObjectId &&
        acct.userId.toString() === uid &&
        typeof acct.password === "string" &&
        (await verifyPassword({ hash: acct.password, password: TEST_PASSWORD }));
      if (!valid) {
        ok = false;
        console.error(`VERIFY FAILED for ${p.email}`);
      }
    }
    if (!ok) throw new Error("Account verification failed — do not use these accounts.");

    console.log("\nAll test accounts verified (password: %s):", TEST_PASSWORD);
    for (const p of people) {
      console.log(`  ${p.role.padEnd(7)} ${p.email}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
