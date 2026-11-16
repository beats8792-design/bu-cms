"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/modules/auth/auth-client";
import { Button, inputClass, Notice } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setUnverified(false);

    const { error: err } = await authClient.signIn.email({ email, password });
    if (!err) {
      router.push("/dashboard");
      router.refresh();
      return;
    }

    if (err.code === "EMAIL_NOT_VERIFIED" || err.message?.toLowerCase().includes("verify")) {
      setUnverified(true);
      setError("Please verify your email first.");
    } else if (err.code === "INVALID_EMAIL_OR_PASSWORD") {
      setError("Email or password is incorrect.");
    } else {
      setError(err.message ?? "Sign in failed. Please try again.");
    }
    setLoading(false);
  }

  async function resend() {
    setResent(false);
    const { error: err } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/verify",
    });
    if (!err) setResent(true);
    else if (!unverified) setError(err.message ?? "Could not send the email.");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {unverified ? (
        <p className="text-sm text-muted">
          {resent
            ? "Verification email sent — check your inbox."
            : (
              <button type="button" onClick={resend} className="text-primary underline">
                Resend verification email
              </button>
            )}
        </p>
      ) : null}

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
      <label className="text-sm font-medium">
        Password
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          autoComplete="current-password"
        />
      </label>

      <Button type="submit" disabled={loading} aria-busy={loading || undefined}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-sm text-muted">
        No account yet?{" "}
        <Link href="/register" className="text-primary underline">
          Register
        </Link>
        {" · "}
        <Link href="/forgot-password" className="text-primary underline">
          Forgot password
        </Link>
      </p>
    </form>
  );
}
