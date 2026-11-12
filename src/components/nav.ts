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
  { href: "/library", label: "Library" },
  { href: "/announcements", label: "Announcements" },
  { href: "/notifications", label: "Notifications" },
  { href: "/profile", label: "Profile" },
];

const ADMIN_EXTRA: NavItem[] = [
  { href: "/admin/users", label: "Admin · User management" },
  { href: "/admin/departments", label: "Admin · Departments" },
  { href: "/admin/semesters", label: "Admin · Semesters" },
  { href: "/admin/courses", label: "Admin · Courses" },
];

const CR_EXTRA: NavItem[] = [{ href: "/cr", label: "CR dashboard" }];

/** Study groups are for students/CRs and alumni seniors (canJoinGroup). */
const GROUPS: NavItem[] = [{ href: "/groups", label: "Groups" }];

/** AI study planner (UCM-A4) — students and CRs. */
const STUDY: NavItem[] = [{ href: "/study-plan", label: "Study plan" }];

const ALUMNI: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/library", label: "Library" },
  { href: "/groups", label: "Groups" },
  { href: "/announcements", label: "Announcements" },
];

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  admin: [...SHARED, ...ADMIN_EXTRA],
  teacher: SHARED,
  cr: [...SHARED, ...GROUPS, ...STUDY, ...CR_EXTRA],
  student: [...SHARED, ...GROUPS, ...STUDY],
  alumni: ALUMNI,
};
