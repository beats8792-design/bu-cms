import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { appGate } from "@/modules/auth/session";
import { getCourse } from "@/modules/academic/courses";
import { getGroup } from "@/modules/collab/groups";
import { GroupMembershipButtons, Notepad } from "@/modules/collab/components/collab-forms";
import { Badge } from "@/components/ui";

export const instant = false;

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await params;
  return { title: "Group" };
}

export default async function GroupPage({ params }: Props) {
  const { id } = await params;
  const { user } = await appGate();
  const session = { user };

  let group;
  try {
    group = await getGroup(session, id);
  } catch {
    notFound();
  }

  // Read-only for teachers; everyone else in scope can use membership actions.
  const membershipRole = ["admin", "cr", "student", "alumni"].includes(user.role);
  const isOwner = group.ownerId === user.id;
  const isMember = group.members.some((m) => m.userId === user.id);

  const courseLabel = await getCourse(session, group.courseId)
    .then((c) => `${c.code} — ${c.title}`)
    .catch(() => null);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="num text-xs text-muted">
        {courseLabel ?? "course link unavailable"} · section {group.section}
      </p>
      <h1 className="font-display text-2xl font-semibold">{group.name}</h1>
      {group.description ? <p className="mt-1 text-sm">{group.description}</p> : null}

      {membershipRole ? (
        <div className="mt-4">
          <GroupMembershipButtons group={group} isMember={isMember} isOwner={isOwner} userId={user.id} />
        </div>
      ) : null}

      {/* Members */}
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold">
          Members ({group.members.length}/50)
        </h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {group.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2">
              <span className="font-medium">{m.name}</span>
              {m.userId === group.ownerId ? (
                <Badge tone="info">owner</Badge>
              ) : null}
              {m.userId === user.id ? <span className="text-xs text-muted">you</span> : null}
              <span className="num ml-auto text-xs text-muted">
                joined {m.joinedAt.slice(0, 10)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Shared notepad (members + admin only) */}
      {isMember || user.role === "admin" ? (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">Shared notepad</h2>
          <p className="mt-1 text-xs text-muted">
            Everyone in the group edits the same page — last save wins.
          </p>
          <div className="mt-2">
            <Notepad group={group} />
          </div>
        </section>
      ) : (
        <p className="mt-8 text-sm text-muted">Join the group to use the shared notepad.</p>
      )}

      <p className="mt-8">
        <Link href="/groups" className="text-sm underline">
          All groups
        </Link>
      </p>
    </div>
  );
}
