import { config } from "dotenv";
config({ path: ".env.local" });
import { hashPassword } from "better-auth/crypto";
import { ObjectId } from "mongodb";
import { createMongoClient } from "@/lib/db";
import { ensureIndexes } from "@/modules/shared/ensure-indexes";
import { DEFAULT_GRADE_TABLE } from "@/modules/marks/schema";

/**
 * `npm run seed` — demo pilot dataset (Phase 11): one department, one semester,
 * three courses, a teacher, a CR and six students, enrollments, an assignment,
 * an assessment schema with marks, attendance sessions and an announcement.
 *
 * Idempotent: a `meta.seed-demo` marker short-circuits a second run.
 * All demo accounts share the password printed at the end and are `active`
 * + emailVerified, so you can sign in immediately after seeding.
 */

const DEMO_PASSWORD = "Jazbah#2026";

function isoDate(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function dhakaDeadline(daysFromNow: number): { iso: string; at: Date } {
  const iso = `${isoDate(daysFromNow)}T23:59:00+06:00`;
  return { iso, at: new Date(iso) };
}

async function main(): Promise<void> {
  const { client, db } = await createMongoClient();
  try {
    await ensureIndexes(db);

    const marker = await db.collection("meta").findOne({ _id: "seed-demo" } as never);
    if (marker) {
      console.log("Demo data already seeded (meta.seed-demo marker exists). Nothing to do.");
      return;
    }

    /* ------------------------------------------------------ department + semester */
    const now = new Date();
    const dept = (
      await db.collection("departments").findOne({ code: "CSE" })
    ) as { _id: ObjectId } | null;
    const departmentId =
      dept?._id ??
      (
        await db.collection("departments").insertOne({
          code: "CSE",
          name: "Computer Science and Engineering",
          programList: ["B.Sc. in CSE"],
          headUserId: "",
          createdAt: now,
          updatedAt: now,
        })
      ).insertedId;

    const semester = (await db.collection("semesters").findOne({
      academicYear: "2026/2027",
      term: "Autumn",
    })) as { _id: ObjectId } | null;
    const semesterId =
      semester?._id ??
      (
        await db.collection("semesters").insertOne({
          academicYear: "2026/2027",
          term: "Autumn",
          startDate: isoDate(-10),
          endDate: isoDate(110),
          enrollmentOpen: true,
          createdAt: now,
          updatedAt: now,
        })
      ).insertedId;

    /* ---------------------------------------------------------------- users */
    interface DemoUser {
      email: string;
      name: string;
      role: "teacher" | "student" | "cr";
      studentId?: string;
    }
    const people: DemoUser[] = [
      { email: "teacher@demo.versity.edu", name: "Jahid Hasan", role: "teacher" },
      { email: "cr@demo.versity.edu", name: "Nusrat Jahan", role: "cr", studentId: "2101045" },
      { email: "amin@demo.versity.edu", name: "Aminul Islam", role: "student", studentId: "2101001" },
      { email: "fahima@demo.versity.edu", name: "Fahima Akter", role: "student", studentId: "2101002" },
      { email: "rahim@demo.versity.edu", name: "Rahim Uddin", role: "student", studentId: "2101003" },
      { email: "sadia@demo.versity.edu", name: "Sadia Rahman", role: "student", studentId: "2101004" },
      { email: "tanvir@demo.versity.edu", name: "Tanvir Ahmed", role: "student", studentId: "2101005" },
      { email: "mim@demo.versity.edu", name: "Mim Chowdhury", role: "student", studentId: "2101006" },
    ];

    const users = db.collection("user");
    const accounts = db.collection("account");
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const ids = new Map<string, string>();

    for (const p of people) {
      const existing = (await users.findOne({ email: p.email })) as { _id: ObjectId } | null;
      if (existing) {
        ids.set(p.email, existing._id.toString());
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
        departmentId: departmentId.toString(),
        studentId: p.studentId ?? "",
        createdAt: now,
        updatedAt: now,
      });
      await accounts.insertOne({
        userId: _id, // ObjectId — the mongo adapter coerces id/reference fields
        providerId: "credential",
        accountId: _id.toString(), // v1.7 sign-in matches accountId === user.id
        passwordHash,
        createdAt: now,
        updatedAt: now,
      });
      ids.set(p.email, _id.toString());
    }

    const teacherId = ids.get("teacher@demo.versity.edu")!;
    const students = people
      .filter((p) => p.role === "student")
      .map((p) => ({ email: p.email, userId: ids.get(p.email)! }));
    const crId = ids.get("cr@demo.versity.edu")!;

    /* --------------------------------------------------------------- courses */
    const courseSeed = [
      { code: "CSE-101", title: "Introduction to Programming", credits: 3, type: "core" as const, day: 0 },
      { code: "CSE-205", title: "Data Structures", credits: 3, type: "core" as const, day: 2 },
      { code: "CSE-310", title: "Database Systems", credits: 3, type: "elective" as const, day: 4 },
    ];
    const courseId = new Map<string, string>();
    for (const c of courseSeed) {
      const existing = (await db.collection("courses").findOne({
        code: c.code,
        semesterId: semesterId.toString(),
      })) as { _id: ObjectId } | null;
      const id =
        existing?._id ??
        (
          await db.collection("courses").insertOne({
            code: c.code,
            title: c.title,
            credits: c.credits,
            type: c.type,
            departmentId: departmentId.toString(),
            semesterId: semesterId.toString(),
            teacherIds: [teacherId],
            seatLimit: 40,
            syllabus: `Syllabus for ${c.title} — weekly topics, assessment plan and reading list.`,
            schedule: [{ day: c.day, start: "10:00", end: "11:30", room: "Lab-2", section: "A" }],
            createdAt: now,
            updatedAt: now,
          })
        ).insertedId;
      courseId.set(c.code, id.toString());
    }

    /* ------------------------------------------------------------ enrollments */
    const enrollments = db.collection("enrollments");
    for (const code of ["CSE-101", "CSE-205"]) {
      for (const s of [...students, { email: "cr@demo.versity.edu", userId: crId }]) {
        await enrollments.updateOne(
          { courseId: courseId.get(code)!, userId: s.userId },
          {
            $set: { status: "enrolled", section: "A", enrolledAt: now },
            $setOnInsert: { courseId: courseId.get(code)!, userId: s.userId },
          },
          { upsert: true },
        );
      }
    }
    for (const s of students.slice(0, 3)) {
      await enrollments.updateOne(
        { courseId: courseId.get("CSE-310")!, userId: s.userId },
        {
          $set: { status: "enrolled", section: "A", enrolledAt: now },
          $setOnInsert: { courseId: courseId.get("CSE-310")!, userId: s.userId },
        },
        { upsert: true },
      );
    }

    /* ------------------------------------------------------------- assignment */
    const due = dhakaDeadline(7);
    await db.collection("assignments").updateOne(
      { courseId: courseId.get("CSE-101")!, title: "Lab 1: Loops and conditionals" },
      {
        $setOnInsert: {
          courseId: courseId.get("CSE-101")!,
          title: "Lab 1: Loops and conditionals",
          description: "Write five small programs using loops and conditionals. Submit a single PDF.",
          points: 20,
          deadline: due.iso,
          deadlineAt: due.at,
          latePolicy: "allow",
          attachments: [],
          createdBy: teacherId,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );

    /* ------------------------------------------- assessment schema + marks (CSE-101) */
    const cse101 = courseId.get("CSE-101")!;
    const components = [
      { key: "ct1", name: "Class Test 1", maxMarks: 20, weight: 15 },
      { key: "ct2", name: "Class Test 2", maxMarks: 20, weight: 15 },
      { key: "mid", name: "Midterm", maxMarks: 30, weight: 30 },
      { key: "final", name: "Final", maxMarks: 50, weight: 40 },
    ];
    await db.collection("assessment_schemas").updateOne(
      { courseId: cse101 },
      {
        $set: {
          components,
          gradeTable: DEFAULT_GRADE_TABLE,
          published: true,
          publishedAt: now,
          updatedBy: teacherId,
          updatedAt: now,
        },
        $setOnInsert: { courseId: cse101 },
      },
      { upsert: true },
    );

    // Deliberate spread for analytics: Amin = top marks, Sadia = failing,
    // Mim = no marks at all ("no data", not F), Rahim = low attendance below.
    const scorePlan: Record<string, Record<string, number>> = {
      "amin@demo.versity.edu": { ct1: 19, ct2: 18, mid: 27, final: 45 },
      "fahima@demo.versity.edu": { ct1: 16, ct2: 15, mid: 24, final: 38 },
      "rahim@demo.versity.edu": { ct1: 12, ct2: 11, mid: 18, final: 28 },
      "sadia@demo.versity.edu": { ct1: 5, ct2: 4, mid: 9, final: 12 },
      "tanvir@demo.versity.edu": { ct1: 14, ct2: 13, mid: 21, final: 33 },
      // mim: no marks — data-quality + at-risk "no data" path
    };
    for (const s of students) {
      const plan = scorePlan[s.email];
      if (!plan) continue;
      for (const [componentKey, score] of Object.entries(plan)) {
        await db.collection("marks").updateOne(
          { courseId: cse101, userId: s.userId, componentKey },
          {
            $set: { score, updatedBy: teacherId, updatedAt: now },
            $setOnInsert: { history: [] },
          },
          { upsert: true },
        );
      }
    }

    /* ---------------------------------------------------- attendance sessions */
    const sessions = db.collection("attendance_sessions");
    const records = db.collection("attendance_records");
    const topics = ["Variables and types", "Control flow", "Loops and arrays"];
    const absentHeavy = new Set(["rahim@demo.versity.edu", "mim@demo.versity.edu"]);

    for (let i = 0; i < 3; i++) {
      const date = isoDate(-14 + i * 5);
      const existing = (await sessions.findOne({ courseId: cse101, date, section: "A" })) as
        | { _id: ObjectId }
        | null;
      const sessionId =
        existing?._id ??
        (
          await sessions.insertOne({
            courseId: cse101,
            section: "A",
            date,
            topic: topics[i],
            status: "closed",
            createdBy: teacherId,
            closedAt: now,
            createdAt: now,
          })
        ).insertedId;
      for (const s of [...students, { email: "cr@demo.versity.edu", userId: crId }]) {
        const status = absentHeavy.has(s.email) ? (i % 2 === 0 ? "absent" : "present") : "present";
        await records.updateOne(
          { sessionId: sessionId.toString(), userId: s.userId },
          { $set: { status }, $setOnInsert: { sessionId: sessionId.toString(), userId: s.userId } },
          { upsert: true },
        );
      }
    }

    // One open session today (fresh — not a stale-session data-quality hit).
    const today = isoDate(0);
    const open = (await sessions.findOne({ courseId: cse101, date: today, section: "A" })) as
      | { _id: ObjectId }
      | null;
    if (!open) {
      await sessions.insertOne({
        courseId: cse101,
        section: "A",
        date: today,
        topic: "Functions",
        status: "open",
        createdBy: teacherId,
        closedAt: null,
        createdAt: now,
      });
    }

    /* ------------------------------------------------ announcement + calendar */
    await db.collection("announcements").updateOne(
      { title: "Welcome to Autumn 2026/2027" },
      {
        $setOnInsert: {
          scope: "university",
          refId: "",
          section: "",
          title: "Welcome to Autumn 2026/2027",
          body: "Classes start this week. Check your course pages for schedules and materials.",
          pinned: true,
          authorId: teacherId,
          authorName: "Jahid Hasan",
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );

    await db.collection("calendar_events").updateOne(
      { title: "CSE-101 Midterm exam", date: isoDate(10) },
      {
        $setOnInsert: {
          title: "CSE-101 Midterm exam",
          type: "exam",
          date: isoDate(10),
          scope: { type: "course", refId: cse101 },
          description: "Covers weeks 1–6. Closed book.",
        },
      },
      { upsert: true },
    );

    await db.collection("meta").insertOne({ _id: "seed-demo", createdAt: now } as never);
    console.log("Seed complete. Demo accounts (password: %s):", DEMO_PASSWORD);
    for (const p of people) {
      console.log(`  ${p.role.padEnd(7)} ${p.email}`);
    }
    console.log("First admin (for /admin pages): npm run adm -- you@versity.edu");
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
