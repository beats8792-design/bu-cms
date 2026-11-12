import type { Metadata } from "next";
import Link from "next/link";
import { appGate } from "@/modules/auth/session";
import { listActivities, LOG_ACTIONS } from "@/modules/admin/activity";

export const metadata: Metadata = { title: "Admin · Activity log" };

export const instant = false;

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function LogsPage({ searchParams }: Props) {
  const { user } = await appGate();
  const session = { user };
  const sp = await searchParams;
  const action = one(sp.action);
  const search = one(sp.search);
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const { entries, total, pages } = await listActivities(session, { action: action || undefined, search: search || undefined, page });

  const qs = (overrides: Record<string, string>) => {
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    if (search) params.set("search", search);
    for (const [k, v] of Object.entries(overrides)) params.set(k, v);
    return `?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-semibold">Activity log</h1>
      <p className="mt-1 text-sm text-muted">Who did what, newest first (audit trail of key mutations).</p>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <label className="text-sm font-medium">
          Action
          <select name="action" defaultValue={action} className="mt-1 w-52 rounded-md border border-border px-3 py-2">
            <option value="">All actions</option>
            {LOG_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Search actor / target
          <input name="search" defaultValue={search} className="mt-1 w-64 rounded-md border border-border px-3 py-2" />
        </label>
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
          Filter
        </button>
        <a
          href={`/api/admin/reports/activity-logs${action ? `?action=${encodeURIComponent(action)}` : ""}`}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-primary-soft"
        >
          ⬇ Export CSV
        </a>
      </form>

      {entries.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No matching entries.</p>
      ) : (
        <table className="mt-4 w-full border-collapse text-sm">
          <caption className="sr-only">Activity log entries</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-2 pr-3 font-medium">When (UTC)</th>
              <th className="py-2 pr-3 font-medium">Actor</th>
              <th className="py-2 pr-3 font-medium">Action</th>
              <th className="py-2 pr-3 font-medium">Target</th>
              <th className="py-2 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-border hover:bg-primary-soft">
                <td className="num py-2 pr-3 text-muted">{e.createdAt.slice(0, 19).replace("T", " ")}</td>
                <td className="py-2 pr-3">
                  {e.actorName}
                  {e.actorEmail ? <span className="block text-xs text-muted">{e.actorEmail}</span> : null}
                </td>
                <td className="py-2 pr-3">
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary-hover">{e.action}</span>
                </td>
                <td className="py-2 pr-3">{e.target}</td>
                <td className="py-2 text-muted">{e.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pages > 1 ? (
        <p className="mt-4 flex items-center gap-3 text-sm">
          {page > 1 ? (
            <Link href={qs({ page: String(page - 1) })} className="underline">
              ← Newer
            </Link>
          ) : null}
          <span className="num text-muted">
            page {page}/{pages} · {total} entries
          </span>
          {page < pages ? (
            <Link href={qs({ page: String(page + 1) })} className="underline">
              Older →
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
