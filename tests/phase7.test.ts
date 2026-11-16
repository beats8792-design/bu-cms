import { describe, expect, it } from "vitest";
import {
  dueWindows,
  reminderKey,
  labelForWindow,
  NOTIFICATION_TYPES,
} from "@/modules/notifications/schema";
import {
  canPostAnnouncement,
  canSeeAnnouncement,
  sortAnnouncements,
  ComposeSchema,
  scopeLabel,
  type Announcement,
} from "@/modules/announcements/schema";

describe("dueWindows / dedup keys", () => {
  const deadline = (hoursFromNow: number): Date => new Date(Date.now() + hoursFromNow * 3_600_000);

  it("returns windows whose lead time has started", () => {
    expect(dueWindows(deadline(50), new Date())).toEqual([]); // outside the longest window
    expect(dueWindows(deadline(47), new Date())).toEqual([48]);
    expect(dueWindows(deadline(20), new Date())).toEqual([48, 24]);
    expect(dueWindows(deadline(1), new Date())).toEqual([48, 24, 2]);
  });

  it("returns nothing after the deadline passed", () => {
    expect(dueWindows(deadline(-1), new Date())).toEqual([]);
  });

  it("keys and labels are stable", () => {
    expect(reminderKey("a1", 48)).toBe("a1:48h");
    expect(labelForWindow(48)).toBe("in 2 days");
    expect(labelForWindow(24)).toBe("tomorrow");
    expect(labelForWindow(2)).toBe("within 2 hours");
    expect(NOTIFICATION_TYPES).toHaveLength(5);
  });
});

describe("canPostAnnouncement (UCM-R2)", () => {
  const admin = { role: "admin", isTeacherOfCourse: false, isEnrolledCourse: false, departmentId: "" };
  const teacherOfCourse = { role: "teacher", isTeacherOfCourse: true, isEnrolledCourse: false, departmentId: "" };
  const otherTeacher = { ...teacherOfCourse, isTeacherOfCourse: false };
  const crInClass = { role: "cr", isTeacherOfCourse: false, isEnrolledCourse: true, departmentId: "" };
  const crOutside = { ...crInClass, isEnrolledCourse: false };
  const student = { role: "student", isTeacherOfCourse: false, isEnrolledCourse: true, departmentId: "" };

  it("admin posts anywhere", () => {
    for (const scope of ["university", "department", "course", "section"] as const) {
      expect(canPostAnnouncement(scope, admin).ok).toBe(true);
    }
  });

  it("teacher posts only to own courses; university/dept blocked", () => {
    expect(canPostAnnouncement("course", teacherOfCourse).ok).toBe(true);
    expect(canPostAnnouncement("section", teacherOfCourse).ok).toBe(true);
    expect(canPostAnnouncement("course", otherTeacher).ok).toBe(false);
    expect(canPostAnnouncement("university", teacherOfCourse).ok).toBe(false);
    expect(canPostAnnouncement("department", teacherOfCourse).ok).toBe(false);
  });

  it("CR posts only within their own class", () => {
    expect(canPostAnnouncement("course", crInClass).ok).toBe(true);
    expect(canPostAnnouncement("section", crInClass).ok).toBe(true);
    expect(canPostAnnouncement("course", crOutside).ok).toBe(false);
    expect(canPostAnnouncement("university", crInClass).ok).toBe(false);
  });

  it("students never post", () => {
    expect(canPostAnnouncement("course", student).ok).toBe(false);
  });
});

describe("canSeeAnnouncement", () => {
  const base = {
    id: "a1",
    title: "T",
    body: "B",
    pinned: false,
    authorId: "x",
    authorName: "X",
    createdAt: "2026-11-11T00:00:00Z",
    updatedAt: "2026-11-11T00:00:00Z",
  };
  const uni: Announcement = { ...base, scope: "university", refId: "", section: "" };
  const dept: Announcement = { ...base, scope: "department", refId: "d1", section: "" };
  const course: Announcement = { ...base, scope: "course", refId: "c1", section: "" };
  const section: Announcement = { ...base, scope: "section", refId: "c1", section: "B" };

  const viewer = (patch: Partial<Parameters<typeof canSeeAnnouncement>[1]> = {}) => ({
    role: "student",
    departmentId: "d1",
    enrolledCourseIds: ["c1"],
    taughtCourseIds: [],
    sectionByCourse: new Map([["c1", "B"]]),
    ...patch,
  });

  it("university is visible to everyone", () => {
    expect(canSeeAnnouncement(uni, viewer())).toBe(true);
  });

  it("department matches the viewer's department only", () => {
    expect(canSeeAnnouncement(dept, viewer())).toBe(true);
    expect(canSeeAnnouncement(dept, viewer({ departmentId: "d2" }))).toBe(false);
  });

  it("course matches enrolled or teaching", () => {
    expect(canSeeAnnouncement(course, viewer())).toBe(true);
    expect(canSeeAnnouncement(course, viewer({ enrolledCourseIds: [], taughtCourseIds: ["c1"] }))).toBe(true);
    expect(canSeeAnnouncement(course, viewer({ enrolledCourseIds: [] }))).toBe(false);
  });

  it("section matches enrollment section or teaching", () => {
    expect(canSeeAnnouncement(section, viewer())).toBe(true);
    expect(canSeeAnnouncement(section, viewer({ sectionByCourse: new Map([["c1", "A"]]) }))).toBe(false);
    expect(canSeeAnnouncement(section, viewer({ enrolledCourseIds: [], taughtCourseIds: ["c1"] }))).toBe(true);
  });

  it("sorts pinned first, then newest", () => {
    const list = [
      { ...base, scope: "course" as const, refId: "c", section: "", pinned: false, createdAt: "2026-01-02" },
      { ...base, scope: "course" as const, refId: "c", section: "", pinned: true, createdAt: "2026-01-01" },
      { ...base, scope: "course" as const, refId: "c", section: "", pinned: false, createdAt: "2026-01-03" },
    ];
    expect(sortAnnouncements(list).map((a) => a.createdAt)).toEqual(["2026-01-01", "2026-01-03", "2026-01-02"]);
  });

  it("ComposeSchema requires refId outside university + section for section scope", () => {
    expect(ComposeSchema.safeParse({ scope: "university", title: "Hello all", body: "Hi" }).success).toBe(true);
    expect(ComposeSchema.safeParse({ scope: "course", title: "Hello", body: "Hi" }).success).toBe(false);
    expect(
      ComposeSchema.safeParse({ scope: "section", refId: "c1", title: "Hello", body: "Hi" }).success,
    ).toBe(false);
    expect(
      ComposeSchema.safeParse({ scope: "section", refId: "c1", section: "A", title: "Hello", body: "Hi" }).success,
    ).toBe(true);
  });

  it("labels scopes", () => {
    expect(scopeLabel({ scope: "section", section: "B" })).toBe("section B");
    expect(scopeLabel({ scope: "university", section: "" })).toBe("university");
  });
});
