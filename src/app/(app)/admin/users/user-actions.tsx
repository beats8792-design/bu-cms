"use client";

import { useActionState } from "react";
import { setRoleAction, userTransitionAction, markVerifiedAction, type AdminActionState } from "@/modules/admin/actions";
import type { AdminUserRow } from "@/modules/admin/users";

const initial: AdminActionState = {};

/** Per-row admin actions: status transition, role change, manual email verification. */
export function UserActions({ user }: { user: AdminUserRow }) {
  const [state, transitionAction, pending] = useActionState(userTransitionAction, initial);
  const [roleState, roleAction, rolePending] = useActionState(setRoleAction, initial);
  const [verifState, verifAction, verifPending] = useActionState(markVerifiedAction, initial);
  const errorMsg = state.error ?? roleState.error ?? verifState.error;

  const transition =
    user.status === "pending" ? "approve" : user.status === "suspended" ? "reactivate" : "suspend";
  const transitionLabel =
    user.status === "pending" ? "Approve" : user.status === "suspended" ? "Reactivate" : "Suspend";

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {errorMsg ? (
        <span role="alert" className="text-danger" title={errorMsg}>
          ⚠ {errorMsg}
        </span>
      ) : null}

      <form action={transitionAction} className="inline-flex">
        <input type="hidden" name="email" value={user.email} />
        <input type="hidden" name="transition" value={transition} />
        <button
          type="submit"
          disabled={pending}
          className={
            transition === "suspend"
              ? "rounded border border-border px-2.5 py-1 font-medium hover:bg-danger-soft hover:text-danger disabled:opacity-50"
              : "rounded bg-primary px-2.5 py-1 font-medium text-white hover:bg-primary-hover disabled:opacity-50"
          }
        >
          {pending ? "…" : transitionLabel}
        </button>
      </form>

      <form action={roleAction} className="inline-flex">
        <input type="hidden" name="email" value={user.email} />
        <label className="sr-only">Role for {user.email}</label>
        <select
          name="role"
          defaultValue={user.role}
          className="rounded border border-border px-2 py-1"
        >
          {(["admin", "teacher", "cr", "student", "alumni"] as const).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={rolePending}
          className="rounded border border-border px-2.5 py-1 font-medium hover:bg-primary-soft disabled:opacity-50"
        >
          Set
        </button>
      </form>

      {!user.emailVerified && (
        <form action={verifAction} className="inline-flex">
          <input type="hidden" name="email" value={user.email} />
          <button
            type="submit"
            disabled={verifPending}
            title="Use when the verification email can't be received (imported accounts, mail outage)"
            className="rounded border border-warn-soft bg-warn-soft px-2.5 py-1 font-medium text-warn hover:opacity-80 disabled:opacity-50"
          >
            {verifPending ? "…" : "Mark email verified"}
          </button>
        </form>
      )}
    </div>
  );
}
