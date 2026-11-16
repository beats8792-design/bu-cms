"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/modules/auth/auth-client";
import { Button, ButtonLink, Notice, inputClass } from "@/components/ui";

/** Set a new password using the token from the emailed reset link. */
export function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await authClient.resetPassword({ newPassword: password, token });
    if (err) {
      setError(err.message ?? "Reset failed — the link may have expired.");
    } else {
      setDone(true);
    }
    setLoading(false);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4 text-sm">
        <Notice tone="success">
          Password updated. You can sign in with your new password.
        </Notice>
        <Link href="/login" className="inline-block text-primary underline">
          Sign in
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="danger">This reset link is missing its token.</Notice>
        <div>
          <ButtonLink href="/forgot-password" variant="primary" size="sm">
            Request a new link
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <label className="text-sm font-medium">
        New password
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          autoComplete="new-password"
        />
      </label>
      <Button
        type="submit"
        variant="primary"
        disabled={loading}
        aria-busy={loading || undefined}
      >
        {loading ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
