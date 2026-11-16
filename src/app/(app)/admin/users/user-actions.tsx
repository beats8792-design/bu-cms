"use client";

import { useActionState } from "react";
import { setRoleAction, userTransitionAction, markVerifiedAction, type AdminActionState } from "@/modules/admin/actions";
import type { AdminUserRow } from "@/modules/admin/users";
import { Button, Notice, compactInputClass } from "@/components/ui";

const initial: AdminActionState = {};

/** Per-row admin actions: status transition, role change, manual email verification. */
export function UserActions({ user }: { user: AdminUserRow }) {
  const [state, transitionAction, pending] = useActionState(userTransitionAction, initial);
  const [roleState, roleAction, rolePending] = useActionState(setRoleAction, initial);
  const [verifState, verifAction, verifPending] = useActionState(markVerifiedAction, initial);

  const errorMsg = state.error ?? roleState.error ?? verifState.error;
  const successMsg = state.ok
    ? "Status updated."
    : roleState.ok
      ? "Role updated."
      : verifState.ok
        ? "Email marked verified."
        : null;

  const transition =
    user.status === "pending" ? "approve" : user.status === "suspended" ? "reactivate" : "suspend";
  const transitionLabel =
    user.status === "pending" ? "Approve" : user.status === "suspended" ? "Reactivate" : "Suspend";
  const transitionPendingLabel =
    transition === "suspend" ? "Suspending…" : transition === "reactivate" ? "Reactivating…" : "Approving…";

  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <form action={transitionAction} className="inline-flex">
          <input type="hidden" name="email" value={user.email} />
          <input type="hidden" name="transition" value={transition} />
          <Button
            type="submit"
            size="sm"
            variant={transition === "suspend" ? "danger" : "primary"}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {pending ? transitionPendingLabel : transitionLabel}
          </Button>
        </form>

        <form action={roleAction} className="inline-flex items-center gap-2">
          <input type="hidden" name="email" value={user.email} />
          <label className="sr-only">
            Role for {user.email}
            <select name="role" defaultValue={user.role} className={compactInputClass}>
              {(["admin", "teacher", "cr", "student", "alumni"] as const).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={rolePending}
            aria-busy={rolePending || undefined}
          >
            {rolePending ? "Saving…" : "Set"}
          </Button>
        </form>

        {!user.emailVerified && (
          <form action={verifAction} className="inline-flex">
            <input type="hidden" name="email" value={user.email} />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              title="Use when the verification email can't be received (imported accounts, mail outage)"
              disabled={verifPending}
              aria-busy={verifPending || undefined}
            >
              {verifPending ? "Marking…" : "Mark email verified"}
            </Button>
          </form>
        )}
      </div>

      {errorMsg ? <Notice tone="danger" className="text-xs">{errorMsg}</Notice> : null}
      {successMsg ? <Notice tone="success" className="text-xs">{successMsg}</Notice> : null}
    </div>
  );
}
