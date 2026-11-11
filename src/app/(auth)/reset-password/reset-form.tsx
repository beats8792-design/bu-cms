"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/modules/auth/auth-client";

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
      <div className="text-sm">
        <p className="rounded-md border border-primary-soft bg-primary-soft px-3 py-2">
          Password updated. You can sign in with your new password.
        </p>
        <a href="/login" className="mt-4 inline-block text-primary underline">
          Sign in
        </a>
      </div>
    );
  }

  if (!token) {
    return <p className="text-sm text-danger">This link is missing its token. Request a new reset email.</p>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      <label className="text-sm font-medium">
        New password
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-border px-3 py-2"
          autoComplete="new-password"
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
      >
        {loading ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
