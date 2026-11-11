import type { Role } from "@/modules/auth/rbac";

export interface NavItem {
  href: string;
  label: string;
}

/** Base items shared by every signed-in role. */
const SHARED: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/courses", label: "Courses" },
  { href: "/schedule", label: "Schedule" },
  { href: "/calendar", label: "Calendar" },
  { href: "/announcements", label: "Announcements" },
  { href: "/profile", label: "Profile" },
];

const ADMIN_EXTRA: NavItem[] = [
  { href: "/admin/users", label: "Admin · User management" },
  { href: "/admin/departments", label: "Admin · Departments" },
  { href: "/admin/semesters", label: "Admin · Semesters" },
  { href: "/admin/courses", label: "Admin · Courses" },
];

const ALUMNI: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/announcements", label: "Announcements" },
];

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  admin: [...SHARED, ...ADMIN_EXTRA],
  teacher: SHARED,
  cr: SHARED,
  student: SHARED,
  alumni: ALUMNI,
};

/** Placeholder pages that exist yet; used to avoid dead links in Phase 0/1. */
export const COMING_SOON_HREFS = ["/announcements"];
