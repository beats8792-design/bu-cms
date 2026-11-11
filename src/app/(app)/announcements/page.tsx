import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Announcements" };

export default function AnnouncementsPage() {
  return <ComingSoon title="Announcements" phase="Phase 7 — notifications & CR" />;
}
