import type { Metadata } from "next";
import { appGate } from "@/modules/auth/session";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Profile" };

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrator",
  teacher: "Teacher",
  cr: "Class Representative",
  student: "Student",
  alumni: "Alumni",
};

export default async function ProfilePage() {
  const { user } = await appGate();
  const canEditStudentId = user.role === "student" || user.role === "cr";

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-2xl font-semibold">Profile</h1>
      <dl className="mt-4 grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted">Email</dt>
        <dd>
          {user.email}
          {user.emailVerified ? (
            <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary-hover">verified</span>
          ) : (
            <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 text-xs text-warn">not verified</span>
          )}
        </dd>
        <dt className="text-muted">Role</dt>
        <dd>{ROLE_LABEL[user.role]}</dd>
        {user.studentId ? (
          <>
            <dt className="text-muted">Student ID</dt>
            <dd className="num">{user.studentId}</dd>
          </>
        ) : null}
      </dl>

      <div className="mt-8">
        <ProfileForm
          name={user.name}
          displayName={user.displayName ?? ""}
          studentId={user.studentId ?? ""}
          canEditStudentId={canEditStudentId}
        />
      </div>

      <h2 className="mt-10 font-display text-lg font-semibold">Change password</h2>
      <div className="mt-4">
        <PasswordForm />
      </div>
    </div>
  );
}
