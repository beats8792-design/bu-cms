import { describe, expect, it } from "vitest";
import { hasRole, isRole, requireRole, roleOf, ROLES, type SessionForAuth } from "@/modules/auth/rbac";
import { AppError } from "@/modules/shared/errors";

const session = (role?: string): SessionForAuth =>
  role ? { user: { id: "u1", role } } : { user: null };

describe("isRole / roleOf", () => {
  it("recognizes only the five canonical roles", () => {
    expect(ROLES).toEqual(["admin", "teacher", "cr", "student", "alumni"]);
    for (const r of ROLES) expect(isRole(r)).toBe(true);
    expect(isRole("root")).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole("")).toBe(false);
  });

  it("maps session to role, null when signed out or unknown role", () => {
    expect(roleOf(session("teacher"))).toBe("teacher");
    expect(roleOf(session("root"))).toBeNull();
    expect(roleOf(null)).toBeNull();
  });
});

describe("hasRole", () => {
  it("checks membership of allowed set", () => {
    expect(hasRole(session("student"), ["student", "alumni"])).toBe(true);
    expect(hasRole(session("teacher"), ["student"])).toBe(false);
  });
});

describe("requireRole", () => {
  it("throws UNAUTHORIZED for missing session", () => {
    expect(() => requireRole(null, ["student"])).toThrowError(AppError);
    try {
      requireRole(null, ["student"]);
    } catch (err) {
      expect((err as AppError).code).toBe("UNAUTHORIZED");
      expect((err as AppError).status).toBe(401);
    }
  });

  it("throws FORBIDDEN when role is outside the allowed set", () => {
    try {
      requireRole(session("student"), ["teacher"]);
      expect.unreachable();
    } catch (err) {
      expect((err as AppError).code).toBe("FORBIDDEN");
      expect((err as AppError).status).toBe(403);
    }
  });

  it("admin passes every guard implicitly", () => {
    expect(() => requireRole(session("admin"), ["teacher"])).not.toThrow();
    expect(() => requireRole(session("admin"), [])).not.toThrow();
  });

  it("marks the session asserted so TS narrows user.id", () => {
    const s = session("teacher");
    requireRole(s, ["teacher"]);
    expect(s.user?.id).toBe("u1");
  });
});
