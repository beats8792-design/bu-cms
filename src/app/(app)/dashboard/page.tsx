import type { Metadata } from "next";
import { appGate } from "@/modules/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

const MODULES: { name: string; phase: string; status: "ready" | "pending" }[] = [
  { name: "Academics — courses & enrollment", phase: "Phase 2", status: "pending" },
  { name: "Course materials", phase: "Phase 3", status: "pending" },
  { name: "Assignments", phase: "Phase 4", status: "pending" },
  { name: "Attendance", phase: "Phase 5", status: "pending" },
  { name: "Marks & results", phase: "Phase 6", status: "pending" },
  { name: "Announcements & CR", phase: "Phase 7", status: "pending" },
  { name: "Collaboration", phase: "Phase 8", status: "pending" },
  { name: "AI assistant", phase: "Phase 9", status: "pending" },
  { name: "Admin analytics", phase: "Phase 10", status: "pending" },
];

const PHASE1_FEATURES = ["Auth & roles", "Approval gating", "Profile", "Admin user management"];

export default async function DashboardPage() {
  const { user } = await appGate();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-semibold">
        Welcome, {user.displayName || user.name}
      </h1>
      <p className="mt-2 text-muted">
        Signed in as <strong>{user.role}</strong> ({user.email}
        {user.studentId ? ` · ID ${user.studentId}` : ""}) — approved and active.
      </p>

      <div className="mt-6">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
          Live in this phase
        </h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {PHASE1_FEATURES.map((f) => (
            <li key={f} className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-hover">
              {f}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
          Modules on the roadmap
        </h2>
        <ul className="mt-2 grid gap-3">
          {MODULES.map((m) => (
            <li
              key={m.name}
              className="flex items-center justify-between rounded-lg border border-border bg-surface p-4"
            >
              <span className="text-sm font-medium">{m.name}</span>
              <span className="text-xs text-muted">{m.phase}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
