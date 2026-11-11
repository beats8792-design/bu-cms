import { AppError } from "@/modules/shared/errors";

/**
 * Role model + authorization primitives (pure, fully unit-tested).
 * Resource scoping (own-course / own-department) is layered on top of this
 * inside each module's service during later phases.
 */

export const ROLES = ["admin", "teacher", "cr", "student", "alumni"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export interface SessionForAuth {
  user?: { id: string; role?: string | null } | null;
}

export function roleOf(session: SessionForAuth | null | undefined): Role | null {
  if (!session?.user) return null;
  const role = session.user.role;
  return isRole(role) ? role : null;
}

export function hasRole(session: SessionForAuth | null | undefined, allowed: Role[]): boolean {
  const role = roleOf(session);
  return role !== null && allowed.includes(role);
}

/**
 * Guards a server operation:
 * - no session -> 401 UNAUTHORIZED
 * - session but role not in allowed (unless admin) -> 403 FORBIDDEN
 * Admins pass every guard implicitly.
 */
export function requireRole(
  session: SessionForAuth | null | undefined,
  allowed: Role[],
): asserts session is SessionForAuth & { user: { id: string; role: Role } } {
  if (!session?.user) {
    throw new AppError("UNAUTHORIZED", "You need to sign in to do that.");
  }
  const role = roleOf(session);
  if (!role || (!allowed.includes(role) && role !== "admin")) {
    throw new AppError("FORBIDDEN", "Your role does not have access to this action.");
  }
}
