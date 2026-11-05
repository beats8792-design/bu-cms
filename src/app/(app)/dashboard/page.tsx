import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

const MODULES: { name: string; phase: string; status: "ready" | "pending" }[] = [
  { name: "Auth — roles & profiles", phase: "Phase 1", status: "pending" },
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

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-semibold">Welcome to Jazbah UCMS</h1>
      <p className="mt-2 text-muted">
        The scaffold is live. Modules unlock as their phases complete.
      </p>
      <ul className="mt-6 grid gap-3">
        {MODULES.map((m) => (
          <li
            key={m.name}
            className="flex items-center justify-between rounded-lg border border-border bg-surface p-4"
          >
            <span className="text-sm font-medium">{m.name}</span>
            <span className="rounded-full border border-border bg-bg px-2.5 py-1 text-xs text-muted">
              {m.phase} · {m.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
