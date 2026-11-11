import type { Metadata } from "next";
import Link from "next/link";
import { listUsersData } from "@/modules/admin/actions";

export const metadata: Metadata = { title: "Admin dashboard" };

export default async function AdminPage() {
  const [{ total }, { users }, pending, suspended] = await Promise.all([
    listUsersData({}),
    listUsersData({ role: "admin" }),
    listUsersData({ status: "pending" }),
    listUsersData({ status: "suspended" }),
  ]);
  void users;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-semibold">Admin console</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Total accounts" value={total} />
        <Stat label="Pending approval" value={pending.total} warn={pending.total > 0} />
        <Stat label="Suspended" value={suspended.total} warn={suspended.total > 0} />
      </div>
      <Link
        href="/admin/users"
        className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
      >
        Manage users
      </Link>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`num font-display text-2xl font-semibold ${warn ? "text-warn" : ""}`}>
        {value}
      </p>
    </div>
  );
}
