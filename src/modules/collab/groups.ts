import { getDb } from "@/lib/db";
import { requireRole, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";
import {
  GroupSchema,
  MAX_GROUP_MEMBERS,
  canJoinGroup,
  validateNotepad,
  type StudyGroup,
} from "@/modules/collab/schema";
import { toObjectId } from "@/modules/academic/model";
import { isEnrolledIn } from "@/modules/collab/notes";

/**
 * Study groups service (UCM-C3): per (course, section) groups with member
 * management and a shared notepad (last-writer-wins, author + timestamp).
 * Alumni (seniors) may join; students/CRs must be enrolled in the course.
 */

interface GroupDoc {
  _id: unknown;
  courseId: string;
  section: string;
  name: string;
  description: string;
  ownerId: string;
  members: Array<{ userId: string; name: string; joinedAt: Date }>;
  notes: string;
  notesUpdatedAt: Date | null;
  notesUpdatedBy: string;
  notesUpdatedByName?: string;
  createdAt: Date;
}

function toGroup(d: GroupDoc & { _id: unknown }): StudyGroup {
  return {
    id: String(d._id),
    courseId: d.courseId,
    section: d.section ?? "A",
    name: d.name,
    description: d.description ?? "",
    ownerId: d.ownerId,
    members: (d.members ?? []).map((m) => ({
      userId: m.userId,
      name: m.name,
      joinedAt: (m.joinedAt ?? new Date()).toISOString(),
    })),
    notes: d.notes ?? "",
    notesUpdatedAt: d.notesUpdatedAt ? d.notesUpdatedAt.toISOString() : null,
    notesUpdatedBy: d.notesUpdatedBy ?? "",
    notesUpdatedByName: d.notesUpdatedByName ?? "",
    createdAt: (d.createdAt ?? new Date()).toISOString(),
  };
}

/* ------------------------------------------------------------------ queries */

export async function getGroup(
  session: SessionForAuth | null,
  groupId: string,
): Promise<StudyGroup> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const doc = (await (await getDb())
    .collection("study_groups")
    .findOne({ _id: toObjectId(groupId) })) as (GroupDoc & { _id: unknown }) | null;
  if (!doc) throw new AppError("NOT_FOUND", "Group not found.");
  return toGroup(doc);
}

export async function listGroups(
  session: SessionForAuth | null,
  opts: { mineOnly?: boolean; courseId?: string } = {},
): Promise<StudyGroup[]> {
  requireRole(session, ["admin", "teacher", "cr", "student", "alumni"]);
  const user = session!.user as { id: string };
  const db = await getDb();
  const filter: Record<string, unknown> = {};
  if (opts.courseId) filter.courseId = opts.courseId;
  if (opts.mineOnly) filter["members.userId"] = user.id;

  const docs = (await db
    .collection("study_groups")
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray()) as unknown as (GroupDoc & { _id: unknown })[];
  return docs.map(toGroup);
}

/* ------------------------------------------------------------------- writes */

export async function createGroup(session: SessionForAuth | null, input: unknown): Promise<string> {
  requireRole(session, ["admin", "cr", "student"]);
  const parsed = GroupSchema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", parsed.error.issues[0].message);
  const user = session!.user as { id: string; role: string; name: string };

  if (user.role !== "admin" && !(await isEnrolledIn(parsed.data.courseId, user.id))) {
    throw new AppError("FORBIDDEN", "Enroll in this course to create a group.");
  }

  // Group is section-bound to the creator's enrollment section (or "A").
  const row = (await (await getDb())
    .collection("enrollments")
    .findOne({ courseId: parsed.data.courseId, userId: user.id, status: "enrolled" }, { projection: { section: 1 } })) as
    | { section: string }
    | null;

  const now = new Date();
  const inserted = await (await getDb()).collection("study_groups").insertOne({
    ...parsed.data,
    section: row?.section ?? "A",
    ownerId: user.id,
    members: [{ userId: user.id, name: user.name, joinedAt: now }],
    notes: "",
    notesUpdatedAt: null,
    notesUpdatedBy: "",
    notesUpdatedByName: "",
    createdAt: now,
  });
  return String(inserted.insertedId);
}

export async function joinGroup(session: SessionForAuth | null, groupId: string): Promise<void> {
  requireRole(session, ["admin", "cr", "student", "alumni"]);
  const user = session!.user as { id: string; role: string; name: string };
  const db = await getDb();
  const doc = (await db.collection("study_groups").findOne({ _id: toObjectId(groupId) })) as
    | (GroupDoc & { _id: unknown })
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Group not found.");

  const gate = canJoinGroup({
    role: user.role,
    enrolled: await isEnrolledIn(doc.courseId, user.id),
    alreadyMember: (doc.members ?? []).some((m) => m.userId === user.id),
    memberCount: (doc.members ?? []).length,
  });
  if (!gate.ok) throw new AppError("CONFLICT", gate.reason);

  await db.collection("study_groups").updateOne(
    { _id: toObjectId(groupId) },
    {
      $push: { members: { userId: user.id, name: user.name, joinedAt: new Date() } } as never,
    },
  );
}

export async function leaveGroup(session: SessionForAuth | null, groupId: string): Promise<void> {
  requireRole(session, ["admin", "cr", "student", "alumni"]);
  const user = session!.user as { id: string };
  const db = await getDb();
  const doc = (await db.collection("study_groups").findOne({ _id: toObjectId(groupId) })) as
    | (GroupDoc & { _id: unknown })
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Group not found.");
  if (doc.ownerId === user.id) {
    throw new AppError("CONFLICT", "Owners can't leave their own group — delete it or transfer ownership first.");
  }
  await db
    .collection("study_groups")
    .updateOne({ _id: toObjectId(groupId) }, { $pull: { members: { userId: user.id } } as never });
}

/** Owner (or admin) removes a member; the owner can't be removed. */
export async function removeMember(
  session: SessionForAuth | null,
  groupId: string,
  memberId: string,
): Promise<void> {
  requireRole(session, ["admin", "cr", "student"]);
  const user = session!.user as { id: string; role: string };
  const db = await getDb();
  const doc = (await db.collection("study_groups").findOne({ _id: toObjectId(groupId) })) as
    | (GroupDoc & { _id: unknown })
    | null;
  if (!doc) throw new AppError("NOT_FOUND", "Group not found.");
  if (user.role !== "admin" && doc.ownerId !== user.id) {
    throw new AppError("FORBIDDEN", "Only the group owner can remove members.");
  }
  if (memberId === doc.ownerId) {
    throw new AppError("CONFLICT", "The owner can't be removed.");
  }
  await db
    .collection("study_groups")
    .updateOne({ _id: toObjectId(groupId) }, { $pull: { members: { userId: memberId } } as never });
}

export async function deleteGroup(session: SessionForAuth | null, groupId: string): Promise<void> {
  requireRole(session, ["admin", "cr", "student"]);
  const user = session!.user as { id: string; role: string };
  const doc = (await (await getDb())
    .collection("study_groups")
    .findOne({ _id: toObjectId(groupId) })) as (GroupDoc & { _id: unknown }) | null;
  if (!doc) throw new AppError("NOT_FOUND", "Group not found.");
  if (user.role !== "admin" && doc.ownerId !== user.id) {
    throw new AppError("FORBIDDEN", "Only the group owner can delete the group.");
  }
  await (await getDb()).collection("study_groups").deleteOne({ _id: toObjectId(groupId) });
}

/** Shared notepad (UCM-C3): last-writer-wins with author + timestamp. */
export async function saveGroupNotes(
  session: SessionForAuth | null,
  groupId: string,
  notes: string,
): Promise<void> {
  requireRole(session, ["admin", "cr", "student", "alumni"]);
  const user = session!.user as { id: string; role: string; name: string };
  const doc = (await (await getDb())
    .collection("study_groups")
    .findOne({ _id: toObjectId(groupId) })) as (GroupDoc & { _id: unknown }) | null;
  if (!doc) throw new AppError("NOT_FOUND", "Group not found.");

  const member = (doc.members ?? []).some((m) => m.userId === user.id);
  if (!member && user.role !== "admin") {
    throw new AppError("FORBIDDEN", "Join the group to edit the shared notepad.");
  }
  const problem = validateNotepad(notes);
  if (problem) throw new AppError("VALIDATION_FAILED", problem);

  await (await getDb())
    .collection("study_groups")
    .updateOne(
      { _id: toObjectId(groupId) },
      {
        $set: {
          notes,
          notesUpdatedAt: new Date(),
          notesUpdatedBy: user.id,
          notesUpdatedByName: user.name,
        },
      },
    );
}

export { MAX_GROUP_MEMBERS };
