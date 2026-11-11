import { describe, expect, it } from "vitest";
import {
  buildWeekGrid,
  canSelfEnroll,
  findScheduleConflicts,
  minutesOf,
  ScheduleSlotSchema,
  SemesterSchema,
  CourseSchema,
  type ScheduleSlot,
} from "@/modules/academic/schema";

describe("SemesterSchema", () => {
  it("accepts a valid semester", () => {
    const r = SemesterSchema.safeParse({
      academicYear: "2025/2026",
      term: "Autumn",
      startDate: "2025-09-01",
      endDate: "2025-12-31",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.enrollmentOpen).toBe(false); // default closed
    }
  });

  it("rejects inverted date ranges", () => {
    const r = SemesterSchema.safeParse({
      academicYear: "2025/2026",
      term: "Autumn",
      startDate: "2025-12-31",
      endDate: "2025-09-01",
    });
    expect(r.success).toBe(false);
  });

  it("rejects malformed academic years", () => {
    const r = SemesterSchema.safeParse({
      academicYear: "2025-2026",
      term: "Autumn",
      startDate: "2025-09-01",
      endDate: "2025-12-31",
    });
    expect(r.success).toBe(false);
  });
});

describe("CourseSchema", () => {
  const base = {
    code: "CSE-101",
    title: "Intro to Programming",
    credits: 3,
    departmentId: "d1",
    semesterId: "s1",
  };

  it("normalizes course codes to uppercase", () => {
    const r = CourseSchema.safeParse({ ...base, code: "cse-101" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.code).toBe("CSE-101");
  });

  it("rejects short/invalid codes and extreme credits", () => {
    expect(CourseSchema.safeParse({ ...base, code: "AB" }).success).toBe(false);
    expect(CourseSchema.safeParse({ ...base, credits: 20 }).success).toBe(false);
    expect(CourseSchema.safeParse({ ...base, seatLimit: 0 }).success).toBe(false);
  });

  it("defaults seats to 40 and schedule to empty", () => {
    const r = CourseSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.seatLimit).toBe(40);
      expect(r.data.schedule).toEqual([]);
      expect(r.data.type).toBe("core");
    }
  });
});

describe("ScheduleSlotSchema", () => {
  it("rejects end <= start", () => {
    expect(ScheduleSlotSchema.safeParse({ day: 1, start: "10:00", end: "10:00" }).success).toBe(false);
    expect(ScheduleSlotSchema.safeParse({ day: 1, start: "11:00", end: "10:00" }).success).toBe(false);
  });

  it("rejects bad time formats", () => {
    expect(ScheduleSlotSchema.safeParse({ day: 1, start: "25:00", end: "26:00" }).success).toBe(false);
    expect(ScheduleSlotSchema.safeParse({ day: 1, start: "9:00", end: "10:00" }).success).toBe(false);
  });
});

describe("canSelfEnroll", () => {
  const base = {
    role: "student",
    status: "active" as const,
    windowOpen: true,
    seatsTaken: 10,
    seatLimit: 40,
    existingStatus: null,
  };

  it("enrolls an active student in an open window with seats", () => {
    expect(canSelfEnroll(base)).toEqual({ ok: true });
  });

  it("blocks non-students, inactive accounts, closed windows, full courses, duplicates", () => {
    expect(canSelfEnroll({ ...base, role: "teacher" }).ok).toBe(false);
    expect(canSelfEnroll({ ...base, status: "suspended" }).ok).toBe(false);
    expect(canSelfEnroll({ ...base, windowOpen: false }).ok).toBe(false);
    expect(canSelfEnroll({ ...base, seatsTaken: 40 }).ok).toBe(false);
    expect(canSelfEnroll({ ...base, existingStatus: "enrolled" }).ok).toBe(false);
  });

  it("CR counts as self-enrollable (section binding)", () => {
    expect(canSelfEnroll({ ...base, role: "cr" })).toEqual({ ok: true });
  });
});

describe("findScheduleConflicts", () => {
  const slot = (over: Partial<ScheduleSlot>): ScheduleSlot => ({
    day: 1,
    start: "10:00",
    end: "11:00",
    room: "",
    section: "A",
    ...over,
  });

  it("flags same-section overlaps on the same day", () => {
    const conflicts = findScheduleConflicts([slot({}), slot({ start: "10:30", end: "12:00" })]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toContain("Mon");
  });

  it("allows parallel sections and different days", () => {
    expect(findScheduleConflicts([slot({}), slot({ start: "10:30", end: "12:00", section: "B" })])).toHaveLength(0);
    expect(findScheduleConflicts([slot({}), slot({ day: 2, start: "10:00", end: "12:00" })])).toHaveLength(0);
  });

  it("allows back-to-back slots", () => {
    expect(findScheduleConflicts([slot({}), slot({ start: "11:00", end: "12:00" })])).toHaveLength(0);
  });
});

describe("buildWeekGrid", () => {
  it("groups slots by day sorted by start time", () => {
    const grid = buildWeekGrid([
      { day: 1, start: "14:00", end: "15:00", room: "", section: "A" },
      { day: 1, start: "09:00", end: "10:00", room: "", section: "A" },
      { day: 3, start: "08:00", end: "09:00", room: "", section: "A" },
    ]);
    expect(grid.get(1)?.map((s) => s.start)).toEqual(["09:00", "14:00"]);
    expect(grid.get(3)).toHaveLength(1);
    expect(minutesOf("09:30")).toBe(570);
  });
});
