import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Courses" };

export default function CoursesPage() {
  return <ComingSoon title="Courses" phase="Phase 2 — academic core" />;
}
