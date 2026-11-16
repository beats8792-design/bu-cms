import type { Metadata } from "next";
import Link from "next/link";
import { appGate } from "@/modules/auth/session";
import { myCourseIds } from "@/modules/academic/enrollment";
import { listCourses } from "@/modules/academic/courses";
import { listGroups } from "@/modules/collab/groups";
import { GroupCreator } from "@/modules/collab/components/collab-forms";
import { Badge, EmptyState, ModalButton, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Study groups" };

export const instant = false;

export default async function GroupsPage() {
  const { user } = await appGate();
  const session = { user };
  const isStudentish = user.role === "student" || user.role === "cr";

  const [allGroups, myCourseIdList] = await Promise.all([
    listGroups(session),
    isStudentish ? myCourseIds(session) : Promise.resolve<string[]>([]),
  ]);

  // Students/CRs see their groups + groups of their courses; staff and
  // seniors see everything (alumni may join any group).
  const visible = isStudentish
    ? allGroups.filter(
        (g) => g.members.some((m) => m.userId === user.id) || myCourseIdList.includes(g.courseId),
      )
    : allGroups;
  const mine = visible.filter((g) => g.members.some((m) => m.userId === user.id));
  const others = visible.filter((g) => !g.members.some((m) => m.userId === user.id));

  // Creator options: enrolled courses (students/CRs) or everything (admin).
  const canCreate = user.role === "admin" || isStudentish;
  const allCourses = await listCourses(session);
  const courseLabel = new Map(allCourses.map((c) => [c.id, `${c.code} — ${c.title}`]));
  const creatorCourses = canCreate
    ? allCourses.filter((c) => user.role === "admin" || myCourseIdList.includes(c.id))
    : [];

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-2xl font-semibold">Study groups</h1>
      <p className="mt-1 text-sm text-muted">
        Per-course study groups with a shared notepad. Seniors (alumni) can join too.
      </p>

      {canCreate ? (
        <div className="mt-4">
          <ModalButton
            label="Create a group"
            title="Create a group"
            description="Groups are created per course — pick the course and name the group."
          >
            {creatorCourses.length > 0 ? (
              <GroupCreator courses={creatorCourses.map((c) => ({ id: c.id, code: c.code, title: c.title }))} />
            ) : (
              <Notice tone="warn">
                Enroll in a course first — groups are created per course.
              </Notice>
            )}
          </ModalButton>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No study groups yet">
            {isStudentish
              ? "No study groups for your courses yet — create the first one."
              : "No study groups yet — create the first one."}
          </EmptyState>
        </div>
      ) : null}

      {mine.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-muted">My groups ({mine.length})</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {mine.map((g) => (
              <GroupCard key={g.id} group={g} userId={user.id} courseLabel={courseLabel.get(g.courseId)} />
            ))}
          </ul>
        </section>
      ) : null}

      {others.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-muted">Other groups ({others.length})</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {others.map((g) => (
              <GroupCard key={g.id} group={g} userId={user.id} courseLabel={courseLabel.get(g.courseId)} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function GroupCard({
  group,
  userId,
  courseLabel,
}: {
  group: Awaited<ReturnType<typeof listGroups>>[number];
  userId: string;
  courseLabel?: string;
}) {
  const isOwner = group.ownerId === userId;
  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/groups/${group.id}`} className="font-display text-base font-semibold hover:underline">
          {group.name}
        </Link>
        <Badge tone="info">section {group.section}</Badge>
        {isOwner ? <span className="text-xs text-primary-hover">owner</span> : null}
      </div>
      <p className="num mt-1 text-xs text-muted">
        {courseLabel ?? "course link unavailable"} · {group.members.length} member
        {group.members.length === 1 ? "" : "s"}
      </p>
      {group.description ? <p className="mt-1 text-sm">{group.description}</p> : null}
    </li>
  );
}
