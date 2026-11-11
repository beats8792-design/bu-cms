import { describe, expect, it } from "vitest";
import {
  attendanceStats,
  buildDigest,
  dhakaToday,
  isLowAttendance,
  lowAttendanceMessage,
  applicableSessions,
  OpenSessionSchema,
  RosterSchema,
  DEFAULT_ATTENDANCE_THRESHOLD,
  type StatSession,
} from "@/modules/attendance/schema";

const SESSIONS: StatSession[] = [
  { id: "s1", section: "A", closed: true },
  { id: "s2", section: "A", closed: true },
  { id: "s3", section: "A", closed: false },
  { id: "s4", section: "B", closed: true },
];

describe("applicableSessions", () => {
  it("keeps own-section closed sessions and marked open ones", () => {
    const marked = new Set(["s3"]);
    expect(applicableSessions(SESSIONS, "A", marked).map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("drops open unmarked sessions (they never penalize)", () => {
    expect(applicableSessions(SESSIONS, "A", new Set()).map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("drops other sections", () => {
    const all = [...SESSIONS, { id: "s5", section: "A", closed: true }];
    expect(applicableSessions(all, "B", new Set()).map((s) => s.id)).toEqual(["s4"]);
  });
});

describe("attendanceStats (UCM-F16)", () => {
  it("counts present + late, on the fly", () => {
    const stats = attendanceStats(
      ["present", "absent", "late"],
      SESSIONS,
      "A",
      new Set(["s3"]),
    );
    expect(stats).toEqual({ attended: 2, possible: 3, pct: 66.7 });
  });

  it("returns null pct with no applicable sessions (no fake 100%)", () => {
    expect(attendanceStats([], [], "A", new Set()).pct).toBeNull();
  });

  it("open unmarked sessions stay out of the denominator", () => {
    const stats = attendanceStats(["present"], SESSIONS.slice(0, 3), "A", new Set(["s3"]));
    expect(stats.possible).toBe(3); // s1, s2 closed + s3 marked-while-open
    expect(stats.pct).toBeCloseTo(33.3);
  });
});

describe("low attendance (UCM-F17)", () => {
  it("warns below the default 75% threshold", () => {
    expect(DEFAULT_ATTENDANCE_THRESHOLD).toBe(75);
    expect(isLowAttendance(74.9)).toBe(true);
    expect(isLowAttendance(75)).toBe(false);
    expect(isLowAttendance(null)).toBe(false);
  });

  it("honors a per-course override", () => {
    expect(isLowAttendance(80, 85)).toBe(true);
  });

  it("produces a readable warning message", () => {
    expect(lowAttendanceMessage(60, 75)).toContain("below the 75% threshold");
    expect(lowAttendanceMessage(90, 75)).toBeNull();
  });
});

describe("buildDigest", () => {
  const roster = [
    { userId: "u1", name: "Rafi", studentId: "101", section: "A" },
    { userId: "u2", name: "Amina", studentId: "102", section: "A" },
    { userId: "u3", name: "Nabila", studentId: "103", section: "B" },
  ];

  it("flags low attendees first, sorted by pct then name", () => {
    const rows = buildDigest(
      roster,
      new Map([
        ["u1", ["absent", "absent", "absent"]],
        ["u2", ["present", "present", "present"]],
      ]),
      new Map([
        ["u1", new Set(["s1", "s2", "s3"])],
        ["u2", new Set(["s1", "s2", "s3"])],
      ]),
      SESSIONS,
      75,
    );
    // u1: 0/3 in section A → warning. u2: 3/3 → fine.
    // u3 (section B): only s4 applies, unmarked+closed → 0/1 → warning too.
    expect(rows.map((r) => r.userId)).toEqual(["u3", "u1", "u2"]); // tie at 0% → name order
    expect(rows[0].warning).toBe(true);
    expect(rows[1].warning).toBe(true);
    expect(rows[2].warning).toBe(false);
    expect(rows[2].stats.pct).toBe(100);
  });
});

describe("contracts", () => {
  it("OpenSessionSchema defaults section A + empty topic", () => {
    const r = OpenSessionSchema.safeParse({ courseId: "c1", date: "2026-11-11" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.section).toBe("A");
      expect(r.data.topic).toBe("");
    }
  });

  it("RosterSchema accepts present/absent/late only", () => {
    expect(RosterSchema.safeParse({ marks: [{ userId: "u1", status: "present" }] }).success).toBe(true);
    expect(RosterSchema.safeParse({ marks: [{ userId: "u1", status: "excused" }] }).success).toBe(false);
    expect(RosterSchema.safeParse({ marks: [] }).success).toBe(false);
  });
});

describe("dhakaToday", () => {
  it("is an ISO date computed in Asia/Dhaka", () => {
    expect(dhakaToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
