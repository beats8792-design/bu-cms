import type { Metadata } from "next";

export const metadata: Metadata = { title: "Verify your email" };

export default function VerifyPage() {
  return (
    <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-card">
      <h1 className="font-display text-xl font-semibold">Email verified</h1>
      <p className="mt-2 text-sm text-muted">
        Your email is confirmed. Your account is still awaiting administrator approval —
        you will be able to sign in once it is activated.
      </p>
      <a href="/login" className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">
        Sign in
      </a>
    </div>
  );
}
