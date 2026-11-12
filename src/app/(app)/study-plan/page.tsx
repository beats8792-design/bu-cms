import type { Metadata } from "next";
import { appGate } from "@/modules/auth/session";
import { getPlan } from "@/modules/ai/planner";
import { aiConfigured } from "@/modules/ai/openrouter";
import { PlanBoard, PlanGenerator } from "@/modules/ai/components/ai-forms";

export const metadata: Metadata = { title: "Study plan · UCMS" };

export const instant = false;

export default async function StudyPlanPage() {
  const { user } = await appGate();
  const session = { user };

  // UCM-A4 is a student/CR feature (planner service enforces this too).
  if (user.role !== "student" && user.role !== "cr") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-2xl font-semibold">Study plan</h1>
        <p className="mt-2 text-sm text-muted">The AI study planner is available to enrolled students and CRs.</p>
      </div>
    );
  }

  const plan = await getPlan(session);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-semibold">My weekly study plan</h1>
      <p className="mt-1 text-sm text-muted">
        Built from your enrollments, upcoming deadlines, exam dates and recently covered topics. Tick items off as you
        go — regenerate whenever the week changes.
      </p>

      {!aiConfigured() ? (
        <p role="status" className="mt-4 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          AI features are not configured on this deployment yet.
        </p>
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
