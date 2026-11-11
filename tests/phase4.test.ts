import { describe, expect, it } from "vitest";
import {
  canSubmit,
  deadlineState,
  dhakaToIso,
  formatDeadline,
  isoToDhakaParts,
  mergeStatuses,
  validateScore,
  AssignmentSchema,
  type RosterStudent,
  type SubmissionRow,
} from "@/modules/assignments/schema";

describe("dhakaToIso / isoToDhakaParts round-trip", () => {
  it("converts a Dhaka date+time to the +06:00 ISO form", () => {
    expect(dhakaToIso("2026-11-15", "23:59")).toBe("2026-11-15T23:59:00+06:00");
  });

  it("round-trips through Intl Asia/Dhaka", () => {
    const iso = dhakaToIso("2026-11-15", "23:59");
    expect(isoToDhakaParts(iso)).toEqual({ date: "2026-11-15", time: "23:59" });
  });

  it("rejects malformed inputs", () => {
    expect(() => dhakaToIso("15-11-2026", "23:59")).toThrow();
    expect(() => dhakaToIso("2026-11-15", "24:00")).toThrow();
  });
});

describe("deadlineState / formatDeadline", () => {
  const t0 = Date.UTC(2026, 10, 11, 6, 0, 0); // 2026-11-11 12:00 Dhaka

  it("classifies open / due-soon (48h) / closed", () => {
    expect(deadlineState(dhakaToIso("2026-11-15", "23:59"), new Date(t0))).toBe("open");
    expect(deadlineState(dhakaToIso("2026-11-12", "18:00"), new Date(t0))).toBe("due-soon");
    expect(deadlineState(dhakaToIso("2026-11-10", "18:00"), new Date(t0))).toBe("closed");
  });

  it("shows an absolute Dhaka time + relative chip", () => {
    const text = formatDeadline(dhakaToIso("2026-11-15", "23:59"), new Date(t0));
    expect(text).toContain("(Asia/Dhaka)");
    expect(text).toContain("in 4 days");
  });
});

describe("AssignmentSchema", () => {
  const base = {
    courseId: "c1",
    title: "HW1 — Loops",
    points: 10,
    deadline: "2026-11-15T23:59:00+06:00",
  };

  it("accepts and defaults late policy to allow", () => {
    const r = AssignmentSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.latePolicy).toBe("allow");
  });

  it("rejects wrong-offset deadlines and bad points", () => {
    expect(AssignmentSchema.safeParse({ ...base, deadline: "2026-11-15T23:59:00Z" }).success).toBe(false);
    expect(AssignmentSchema.safeParse({ ...base, points: 0 }).success).toBe(false);
    expect(AssignmentSchema.safeParse({ ...base, points: 1001 }).success).toBe(false);
  });
});

describe("canSubmit", () => {
  const base = {
    role: "student",
    enrolled: true,
    now: Date.UTC(2026, 10, 10, 0, 0, 0),
    deadlineIso: dhakaToIso("2026-11-15", "23:59"),
    latePolicy: "allow" as const,
    hasFiles: true,
  };

  it("allows an on-time enrolled student", () => {
    expect(canSubmit(base)).toEqual({ ok: true, isLate: false });
  });

  it("auto-flags late when policy allows", () => {
    const r = canSubmit({ ...base, now: Date.UTC(2026, 10, 20, 0, 0, 0) });
    expect(r).toEqual({ ok: true, isLate: true });
  });

  it("blocks late when policy blocks, with the PRD message", () => {
    const r = canSubmit({ ...base, now: Date.UTC(2026, 10, 20, 0, 0, 0), latePolicy: "block" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("blocked");
  });

  it("requires enrollment, files and a student role", () => {
    expect(canSubmit({ ...base, enrolled: false }).ok).toBe(false);
    expect(canSubmit({ ...base, hasFiles: false }).ok).toBe(false);
    expect(canSubmit({ ...base, role: "teacher" }).ok).toBe(false);
  });
});

describe("validateScore", () => {
  it("bounds score within [0, points]", () => {
    expect(validateScore(8.5, 10)).toBeNull();
    expect(validateScore(0, 10)).toBeNull();
    expect(validateScore(11, 10)).toContain("between 0 and 10");
    expect(validateScore(-1, 10)).toContain("between 0 and 10");
    expect(validateScore(Number.NaN, 10)).toContain("number");
  });
});

describe("mergeStatuses", () => {
  const roster: RosterStudent[] = [
    { userId: "u1", name: "Amina", studentId: "101", section: "A" },
    { userId: "u2", name: "Rafi", studentId: "102", section: "A" },
    { userId: "u3", name: "Nabila", studentId: "103", section: "B" },
  ];
  const deadline = dhakaToIso("2026-11-15", "23:59");
  const before = Date.UTC(2026, 10, 10);
  const after = Date.UTC(2026, 10, 20);
  const subs: SubmissionRow[] = [
    { userId: "u1", isLate: false, score: 9, submittedAt: "2026-11-12" },
    { userId: "u2", isLate: true, score: null, submittedAt: "2026-11-16" },
  ];

  it("marks graded > late > submitted > pending", () => {
    const rows = mergeStatuses(roster, subs, deadline, before);
    const byUser = new Map(rows.map((r) => [r.userId, r.status]));
    expect(byUser.get("u1")).toBe("graded");
    expect(byUser.get("u2")).toBe("late");
    expect(byUser.get("u3")).toBe("pending");
  });

  it("carries scores through and sorts by section then name", () => {
    const rows = mergeStatuses(roster, subs, deadline, before);
    expect(rows[0].section).toBe("A");
    expect(rows.find((r) => r.userId === "u1")?.score).toBe(9);
  });

  it("treats nothing-submitted-after-deadline as pending (late applies on submit)", () => {
    const rows = mergeStatuses(roster, [], deadline, after);
    expect(rows.every((r) => r.status === "pending")).toBe(true);
  });
});
