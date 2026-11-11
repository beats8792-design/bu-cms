import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Schedule" };

export default function SchedulePage() {
  return <ComingSoon title="Schedule" phase="Phase 2 — academic core" />;
}
