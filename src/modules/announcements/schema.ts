import { z } from "zod";

/**
 * Announcements contracts + pure policies (Phase 7, UCM-R2 + admin flows).
 * Scopes: university (everyone) / department (dept members) / course
 * (enrolled + teachers + admin) / section (course + matching section).
 */

export const ANNOUNCEMENT_SCOPES = ["university", "department", "course", "section"] as const;
export type AnnouncementScope = (typeof ANNOUNCEMENT_SCOPES)[number];

export interface Announcement {
  id: string;
  scope: AnnouncementScope;
  /** departmentId for department scope; courseId for course/section scope. */
  refId: string;
  section: string; // section scope only, "" otherwise
  title: string;
  body: string;
  pinned: boolean;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export const ComposeSchema = z
  .object({
    scope: z.enum(ANNOUNCEMENT_SCOPES),
    refId: z.string().trim().max(60).default(""),
    section: z.string().trim().max(10).default(""),
    title: z.string().trim().min(3).max(160),
    body: z.string().trim().min(1).max(4000),
  })
  .refine(
    (v) => v.scope === "university" || v.refId.length > 0,
    { message: "Pick a department or course for this scope." },
  )
  .refine((v) => v.scope !== "section" || v.section.length > 0, {
    message: "Section is required for a section announcement.",
  });

export interface PostContext {
  role: string;
  /** teacher: assigned to the referenced course (course/section scopes). */
  isTeacherOfCourse: boolean;
  /** cr: enrolled in the referenced course (their class). */
  isEnrolledCourse: boolean;
  /** admin: department they administrate (all, in our model). */
  departmentId: string;
}

/**
 * Pure post gate (UCM-R2 + admin):
 * - admin: any scope
 * - teacher: course/section of their own courses
 * - cr: course/section of their own class (courses they're enrolled in)
 */
export function canPostAnnouncement(
  scope: AnnouncementScope,
  ctx: PostContext,
): { ok: true } | { ok: false; reason: string } {
  if (ctx.role === "admin") return { ok: true };
  if (scope === "university") {
    return { ok: false, reason: "Only admins post university-wide announcements." };
  }
  if (scope === "department") {
    return { ok: false, reason: "Only admins post department announcements." };
  }
  if (ctx.role === "teacher") {
    return ctx.isTeacherOfCourse
      ? { ok: true }
      : { ok: false, reason: "Only teachers of this course can post to it." };
  }
  if (ctx.role === "cr") {
    return ctx.isEnrolledCourse
      ? { ok: true }
      : { ok: false, reason: "CRs post announcements for their own class only." };
  }
  return { ok: false, reason: "You don't have permission to post announcements." };
}

export interface ViewerContext {
  role: string;
  departmentId: string;
  /** Enrolled (active) course ids of the viewer. */
  enrolledCourseIds: string[];
  /** Course ids the viewer teaches. */
  taughtCourseIds: string[];
  /** Section map for enrolled courses: courseId -> section. */
  sectionByCourse: Map<string, string>;
}

/** Pure visibility check: does this viewer see this announcement? */
export function canSeeAnnouncement(a: Announcement, v: ViewerContext): boolean {
  switch (a.scope) {
    case "university":
      return true;
    case "department":
      return a.refId === v.departmentId;
    case "course":
      return (
        v.role === "admin" ||
        v.taughtCourseIds.includes(a.refId) ||
        v.enrolledCourseIds.includes(a.refId)
      );
    case "section":
      return (
        v.role === "admin" ||
        v.taughtCourseIds.includes(a.refId) ||
        (v.enrolledCourseIds.includes(a.refId) && v.sectionByCourse.get(a.refId) === a.section)
      );
  }
}

/** Sort: pinned first, then newest. */
export function sortAnnouncements(list: Announcement[]): Announcement[] {
  return [...list].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      b.createdAt.localeCompare(a.createdAt),
  );
}

export function scopeLabel(a: Pick<Announcement, "scope" | "section">): string {
  return a.scope === "section" ? `section ${a.section}` : a.scope;
}
