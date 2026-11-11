import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/modules/auth/server";
import type { Role } from "@/modules/auth/rbac";
import { ROLES } from "@/modules/auth/rbac";

/**
 * Server-side session access. Next 16 note: `headers()` is async — always await.
 * Includes our BetterAuth additionalFields (role/status/departmentId/studentId).
 */

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: Role;
  displayName?: string;
  departmentId?: string;
  studentId?: string;
  status: "active" | "pending" | "suspended";
}

export interface ServerSession {
  user?: SessionUser & { role?: string; status?: string; displayName?: string };
  session?: { id: string; expiresAt: string; userId: string };
}

/** Raw session (raw BetterAuth shape) for Server Components/Actions. */
export async function getServerSession(): Promise<ServerSession | null> {
  const auth = await getAuth();
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  return (session as unknown as ServerSession) ?? null;
}

export type AppSession = { user: SessionUser };

/**
 * App-area gate: signed out → login; status pending → /pending;
 * status suspended → /suspended; else the active session.
 */
export async function appGate(): Promise<AppSession> {
  const session = await getServerSession();
  if (!session?.user) redirect("/login");

  const raw = session.user;
  const status = (raw.status ?? "active") as SessionUser["status"];
  if (status === "pending") redirect("/pending");
  if (status === "suspended") redirect("/suspended");

  return {
    user: {
      id: raw.id,
      name: raw.name,
      email: raw.email,
      emailVerified: raw.emailVerified,
      role: normalizeRole(raw.role),
      displayName: raw.displayName,
      departmentId: raw.departmentId,
      studentId: raw.studentId,
      status,
    },
  };
}

function normalizeRole(value: string | undefined): Role {
  return ROLES.includes(value as Role) ? (value as Role) : "student";
}

/** Gate for role-restricted page groups; redirects on failure. */
export async function requireRolePage(allowed: Role[]): Promise<AppSession> {
  const session = await appGate();
  if (!allowed.includes(session.user.role)) redirect("/dashboard");
  return session;
}
