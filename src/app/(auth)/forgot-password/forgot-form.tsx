"use client";

import { useState } from "react";
import { authClient } from "@/modules/auth/auth-client";
import { Button, Notice, inputClass } from "@/components/ui";

/** Forgot password: asks for email, triggers BetterAuth reset flow. */
export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    // Same message whether or not the account exists (no user enumeration).
    if (err && err.message?.includes("isn't enabled")) {
      // Keep the flow, but never fail silently — surface that reset is off.
      setSent(true);
      setError("Password reset isn't enabled on this deployment — contact the administrator.");
    } else if (err) {
      setError("Could not start the reset process right now.");
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <p className="text-sm text-muted">
          If an account exists for <strong>{email}</strong>, a reset link is on its way. Check
          your inbox.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <label className="text-sm font-medium">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          autoComplete="email"
        />
      </label>
      <Button
        type="submit"
        variant="primary"
        disabled={loading}
        aria-busy={loading || undefined}
      >
        {loading ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
