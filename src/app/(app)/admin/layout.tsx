import type { Metadata } from "next";
import { requireRolePage } from "@/modules/auth/session";

export const metadata: Metadata = { title: "Admin" };

/** Server-authoritative gate: only admins reach anything under /admin. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRolePage(["admin"]);
  return <div>{children}</div>;
}
