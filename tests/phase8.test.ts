import { describe, expect, it } from "vitest";
import {
  canUploadNote,
  canPinNote,
  canUploadLibraryResource,
  canModerateLibrary,
  canJoinGroup,
  validateNotepad,
  sortNotes,
  kindLabel,
  NOTEPAD_MAX_CHARS,
  MAX_GROUP_MEMBERS,
  LibraryResourceSchema,
  NoteSchema,
} from "@/modules/collab/schema";

describe("canUploadNote (UCM-C1)", () => {
  const base = { enrolled: false, isTeacherOfCourse: false };

  it("allows admins always", () => {
    expect(canUploadNote({ role: "admin", ...base }).ok).toBe(true);
    expect(canUploadNote({ role: "admin", ...base, isTeacherOfCourse: false }).ok).toBe(true);
  });

  it("allows only the course's teachers", () => {
    expect(canUploadNote({ role: "teacher", ...base, isTeacherOfCourse: true }).ok).toBe(true);
    const gate = canUploadNote({ role: "teacher", ...base, isTeacherOfCourse: false });
    expect(gate.ok).toBe(false);
  });

  it("requires enrollment for students and CRs", () => {
    expect(canUploadNote({ role: "student", ...base, enrolled: true }).ok).toBe(true);
    expect(canUploadNote({ role: "cr", ...base, enrolled: true }).ok).toBe(true);
    expect(canUploadNote({ role: "student", ...base }).ok).toBe(false);
    expect(canUploadNote({ role: "cr", ...base }).ok).toBe(false);
  });

  it("rejects teachers of other courses and alumni", () => {
    expect(canUploadNote({ role: "alumni", ...base, enrolled: true }).ok).toBe(false);
  });
});

describe("canPinNote", () => {
  it("admins and the course's teachers pin; others don't", () => {
    expect(canPinNote("admin", false)).toBe(true);
    expect(canPinNote("teacher", true)).toBe(true);
    expect(canPinNote("teacher", false)).toBe(false);
    expect(canPinNote("cr", true)).toBe(false);
    expect(canPinNote("student", false)).toBe(false);
  });
});

describe("library policies (UCM-C2)", () => {
  it("every active signed-in role can contribute (seniors included)", () => {
    for (const role of ["student", "cr", "teacher", "admin", "alumni"]) {
      expect(canUploadLibraryResource(role)).toBe(true);
    }
    expect(canUploadLibraryResource("guest")).toBe(false);
  });

  it("moderation = admin or uploader", () => {
    expect(canModerateLibrary("admin", "u1", "u2")).toBe(true);
    expect(canModerateLibrary("student", "u1", "u1")).toBe(true);
    expect(canModerateLibrary("student", "u1", "u2")).toBe(false);
    expect(canModerateLibrary("teacher", "u1", "u2")).toBe(false);
  });

  it("resource schema: tags optional, kind constrained", () => {
    const ok = LibraryResourceSchema.safeParse({
      title: "CSE-101 Fall 2024 final",
      kind: "past-paper",
      file: { publicId: "ucms/library/x", fileName: "f.pdf", size: 1024 },
    });
    expect(ok.success).toBe(true);
    expect(ok.success && ok.data.departmentId).toBe("");
    expect(LibraryResourceSchema.safeParse({ title: "x", kind: "meme", file: { publicId: "a", fileName: "b", size: 1 } }).success).toBe(false);
  });
});

describe("canJoinGroup (UCM-C3)", () => {
  const base = { alreadyMember: false, memberCount: 10 };

  it("enrolled students and CRs join", () => {
    expect(canJoinGroup({ role: "student", enrolled: true, ...base }).ok).toBe(true);
    expect(canJoinGroup({ role: "cr", enrolled: true, ...base }).ok).toBe(true);
    const gate = canJoinGroup({ role: "student", enrolled: false, ...base });
    expect(gate.ok).toBe(false);
  });

  it("alumni (seniors) join without enrollment; admin too", () => {
    expect(canJoinGroup({ role: "alumni", enrolled: false, ...base }).ok).toBe(true);
    expect(canJoinGroup({ role: "admin", enrolled: false, ...base }).ok).toBe(true);
  });

  it("teachers are not group members", () => {
    expect(canJoinGroup({ role: "teacher", enrolled: true, ...base }).ok).toBe(false);
  });

  it("caps members and blocks re-joining", () => {
    expect(canJoinGroup({ role: "student", enrolled: true, ...base, memberCount: MAX_GROUP_MEMBERS }).ok).toBe(false);
    expect(canJoinGroup({ role: "student", enrolled: true, ...base, alreadyMember: true }).ok).toBe(false);
  });
});

describe("notepad", () => {
  it("accepts within the cap, rejects above", () => {
    expect(validateNotepad("study plan")).toBeNull();
    expect(validateNotepad("x".repeat(NOTEPAD_MAX_CHARS + 1))).toMatch(/capped/i);
  });
});

describe("sortNotes", () => {
  it("pins first, then newest", () => {
    const sorted = sortNotes([
      { id: "a", pinned: false, createdAt: "2026-01-03" },
      { id: "b", pinned: true, createdAt: "2026-01-01" },
      { id: "c", pinned: false, createdAt: "2026-01-02" },
      { id: "d", pinned: true, createdAt: "2026-01-02" },
    ]);
    expect(sorted.map((n) => n.id)).toEqual(["d", "b", "a", "c"]);
  });
});

describe("labels + schemas", () => {
  it("kindLabel covers all kinds", () => {
    expect(kindLabel("past-paper")).toBe("Past paper");
    expect(kindLabel("guide")).toBe("Senior's guide");
    expect(kindLabel("other")).toBe("Other");
  });

  it("note schema enforces title length and file size cap", () => {
    const base = { file: { publicId: "ucms/notes/x", fileName: "n.pdf", size: 1024 } };
    expect(NoteSchema.safeParse({ courseId: "a".repeat(24), title: "Valid title", ...base }).success).toBe(true);
    expect(NoteSchema.safeParse({ courseId: "a".repeat(24), title: "ab", ...base }).success).toBe(false);
    expect(
      NoteSchema.safeParse({ courseId: "a".repeat(24), title: "Valid", ...base, file: { ...base.file, size: 31 * 1024 * 1024 } }).success,
    ).toBe(false);
  });
});
