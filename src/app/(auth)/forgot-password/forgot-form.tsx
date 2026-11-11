"use client";

import { useState } from "react";
import { authClient } from "@/modules/auth/auth-client";

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
    if (err && !err.message?.includes("isn't enabled")) {
      setError("Could not start the reset process right now.");
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <p className="text-sm text-muted">
        If an account exists for <strong>{email}</strong>, a reset link is on its way. Check
        your inbox.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      <label className="text-sm font-medium">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-border px-3 py-2"
          autoComplete="email"
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {loading ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
