import type { Metadata } from "next";
import Link from "next/link";
import { listUsersData } from "@/modules/admin/actions";
import type { AdminUserRow } from "@/modules/admin/users";
import { UserActions } from "./user-actions";

export const metadata: Metadata = { title: "User management" };

type SearchParams = { q?: string; status?: string; role?: string; page?: string };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;
  const result = await listUsersData({
    search: sp.q,
    status: sp.status,
    role: sp.role,
    page,
  });

  const qs = (overrides: Partial<SearchParams>) => {
    const merged: SearchParams = { ...sp, page: undefined, ...overrides };
    return `/admin/users?${new URLSearchParams(
      Object.entries(merged)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => [k, String(v)]),
    ).toString()}`;
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">User management</h1>
        <Link
          href="/admin/users/import"
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-primary-hover"
        >
          Bulk import CSV
        </Link>
      </div>

      {/* Filters — plain GET form */}
      <form method="get" action="/admin/users" className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <label className="text-sm font-medium">
          Search
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Name or email"
            className="mt-1 block w-56 rounded-lg border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <label className="text-sm font-medium">
          Status
          <select name="status" defaultValue={sp.status ?? ""} className="mt-1 block rounded-lg border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Role
          <select name="role" defaultValue={sp.role ?? ""} className="mt-1 block rounded-lg border border-border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">All</option>
            <option value="admin">Admin</option>
            <option value="teacher">Teacher</option>
            <option value="cr">CR</option>
            <option value="student">Student</option>
            <option value="alumni">Alumni</option>
          </select>
        </label>
        <button className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-primary-soft">
          Apply
        </button>
      </form>

      <p className="num mt-3 text-sm text-muted">{result.total} accounts</p>

      {/* Mobile: cards; Desktop: table */}
      <ul className="mt-3 grid gap-3 md:hidden">
        {result.users.map((u) => (
          <li key={u.id} className="rounded-lg border border-border bg-surface p-4">
            <UserRowCard user={u} />
          </li>
        ))}
      </ul>
      <div className="mt-3 hidden overflow-x-auto rounded-lg border border-border bg-surface md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">User accounts</caption>
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {result.users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0 hover:bg-primary-soft/50">
                <td className="px-4 py-3">
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-muted">{u.email}</p>
                </td>
                <td className="px-4 py-3">{u.role}</td>
                <td className="px-4 py-3">
                  <StatusChip status={u.status} emailVerified={u.emailVerified} />
                </td>
                <td className="px-4 py-3">
                  <UserActions user={u} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.users.length === 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-surface p-6 text-sm text-muted">
          No accounts match these filters.
        </div>
      ) : null}

      {result.pages > 1 ? (
        <nav className="mt-4 flex items-center gap-2 text-sm" aria-label="Pagination">
          {result.page > 1 ? (
            <Link href={qs({ page: String(result.page - 1) })} className="rounded-md border border-border px-3 py-1.5 hover:bg-primary-soft">
              ← Prev
            </Link>
          ) : null}
          <span className="num text-muted">
            {result.page} / {result.pages}
          </span>
          {result.page < result.pages ? (
            <Link href={qs({ page: String(result.page + 1) })} className="rounded-md border border-border px-3 py-1.5 hover:bg-primary-soft">
              Next →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function UserRowCard({ user }: { user: AdminUserRow }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{user.name}</p>
          <p className="text-xs text-muted">{user.email}</p>
        </div>
        <StatusChip status={user.status} emailVerified={user.emailVerified} />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted">role: {user.role}</span>
        <UserActions user={user} />
      </div>
    </div>
  );
}

function StatusChip({ status, emailVerified }: { status: string; emailVerified: boolean }) {
  const cls =
    status === "active"
      ? "bg-primary-soft text-primary-hover"
      : status === "pending"
        ? "bg-warn-soft text-warn"
        : "bg-danger-soft text-danger";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status}
      {!emailVerified ? " · unverified" : ""}
    </span>
  );
}
