import type { Metadata } from "next";
import { appGate } from "@/modules/auth/session";
import { getPlan } from "@/modules/ai/planner";
import { aiConfigured } from "@/modules/ai/gemini";
import { PlanBoard, PlanGenerator } from "@/modules/ai/components/ai-forms";
import { PageHeader, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Study plan" };

export const instant = false;

export default async function StudyPlanPage() {
  const { user } = await appGate();
  const session = { user };

  // UCM-A4 is a student/CR feature (planner service enforces this too).
  if (user.role !== "student" && user.role !== "cr") {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Study plan">
          The AI study planner is available to enrolled students and CRs.
        </PageHeader>
      </div>
    );
  }

  const plan = await getPlan(session);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="My weekly study plan">
        Built from your enrollments, upcoming deadlines, exam dates and recently covered topics. Tick items off as you
        go — regenerate whenever the week changes.
      </PageHeader>

      {!aiConfigured() ? (
        <Notice tone="warn" className="mt-4">
          AI features are not configured on this deployment yet.
        </Notice>
      ) : null}

      <div className="mt-4">
        <PlanGenerator hasPlan={Boolean(plan)} />
      </div>

      {plan ? (
        <div className="mt-6">
          <PlanBoard plan={plan} />
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">No plan yet — generate your first one above.</p>
      )}
    </div>
  );
}
