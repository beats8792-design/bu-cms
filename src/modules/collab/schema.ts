import { z } from "zod";

/**
 * Collaboration contracts + pure policies (Phase 8, UCM-C1…C3).
 * Notes live per course; library resources are tagged (kind/dept/course/
 * semester); study groups are per (course, section) with a shared notepad.
 * Files go browser→Cloudinary raw via /api/uploads/sign (kinds: note,
 * library) — never through server actions.
 */

export const MAX_FILE_SIZE = 30 * 1024 * 1024;

export interface FileRef {
  publicId: string;
  fileName: string;
  size: number;
}

/* ------------------------------------------------------------------- notes */

export const NOTE_FILE_TYPES = ["pdf", "jpg", "jpeg", "png", "webp"] as const;
export type NoteFileType = (typeof NOTE_FILE_TYPES)[number];

export const NoteSchema = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(3).max(160),
  file: z.object({
    publicId: z.string().min(3).max(400),
    fileName: z.string().min(1).max(200),
    size: z.number().int().min(1).max(MAX_FILE_SIZE),
  }),
});

export interface CourseNote {
  id: string;
  courseId: string;
  uploaderId: string;
  uploaderName: string;
  title: string;
  file: FileRef;
  pinned: boolean;
  downloads: number;
  createdAt: string;
}

export type NoteGate = {
  role: string;
  enrolled: boolean;
  isTeacherOfCourse: boolean;
};

/** UCM-C1: enrolled students/CRs and the course's teachers upload notes. */
export function canUploadNote(gate: NoteGate): { ok: true } | { ok: false; reason: string } {
  if (gate.role === "admin") return { ok: true };
  if (gate.role === "teacher") return gate.isTeacherOfCourse ? { ok: true } : { ok: false, reason: "Only teachers of this course can upload notes here." };
  if (gate.role === "student" || gate.role === "cr") {
    return gate.enrolled ? { ok: true } : { ok: false, reason: "Enroll in this course to share notes." };
  }
  return { ok: false, reason: "Notes are shared by course members." };
}

/** Pinning is teacher/admin only (UCM-C1 "course supplements"). */
export function canPinNote(role: string, isTeacherOfCourse: boolean): boolean {
  return role === "admin" || (role === "teacher" && isTeacherOfCourse);
}

/* ----------------------------------------------------------------- library */

export const RESOURCE_KINDS = ["past-paper", "guide", "other"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const LibraryResourceSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(1000).default(""),
  kind: z.enum(RESOURCE_KINDS),
  departmentId: z.string().trim().max(60).default(""),
  courseId: z.string().trim().max(60).default(""),
  semesterId: z.string().trim().max(60).default(""),
  file: z.object({
    publicId: z.string().min(3).max(400),
    fileName: z.string().min(1).max(200),
    size: z.number().int().min(1).max(MAX_FILE_SIZE),
  }),
});

export interface LibraryResource {
  id: string;
  title: string;
  description: string;
  kind: ResourceKind;
  departmentId: string;
  courseId: string;
  semesterId: string;
  uploaderId: string;
  uploaderName: string;
  approved: boolean;
  downloads: number;
  createdAt: string;
}

/** UCM-C2: every active signed-in role may contribute (seniors = alumni). */
export function canUploadLibraryResource(role: string): boolean {
  return ["student", "cr", "teacher", "admin", "alumni"].includes(role);
}

/** Moderation (optional approve per ROADMAP): admin hides/shows; uploader deletes own. */
export function canModerateLibrary(role: string, userId: string, uploaderId: string): boolean {
  return role === "admin" || userId === uploaderId;
}

/* ------------------------------------------------------------ study groups */

export const MAX_GROUP_MEMBERS = 50;
export const NOTEPAD_MAX_CHARS = 20_000;

export const GroupSchema = z.object({
  courseId: z.string().min(1),
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(500).default(""),
});

export interface StudyGroup {
  id: string;
  courseId: string;
  section: string;
  name: string;
  description: string;
  ownerId: string;
  members: Array<{ userId: string; name: string; joinedAt: string }>;
  notes: string;
  notesUpdatedAt: string | null;
  notesUpdatedBy: string;
  notesUpdatedByName: string;
  createdAt: string;
}

export type JoinGate = {
  role: string;
  enrolled: boolean;
  alreadyMember: boolean;
  memberCount: number;
};

/**
 * UCM-C3: enrolled students/CRs join; alumni (seniors) join any group;
 * owner/admin can always enter. Cap 50 members.
 */
export function canJoinGroup(gate: JoinGate): { ok: true } | { ok: false; reason: string } {
  if (gate.alreadyMember) return { ok: false, reason: "You are already in this group." };
  if (gate.memberCount >= MAX_GROUP_MEMBERS) {
    return { ok: false, reason: `Groups are capped at ${MAX_GROUP_MEMBERS} members.` };
  }
  if (gate.role === "admin" || gate.role === "alumni") return { ok: true };
  if (gate.role === "student" || gate.role === "cr") {
    return gate.enrolled ? { ok: true } : { ok: false, reason: "Enroll in this course to join its groups." };
  }
  return { ok: false, reason: "Groups are for students and seniors." };
}

export function validateNotepad(text: string): string | null {
  if (text.length > NOTEPAD_MAX_CHARS) return `Notepad is capped at ${NOTEPAD_MAX_CHARS} characters.`;
  return null;
}

/** Sort notes: pinned first, then newest. */
export function sortNotes<T extends { pinned: boolean; createdAt: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
}

export function kindLabel(kind: ResourceKind): string {
  return kind === "past-paper" ? "Past paper" : kind === "guide" ? "Senior's guide" : "Other";
}
