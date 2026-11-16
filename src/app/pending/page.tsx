import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Pending approval" };

export default function PendingPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
        <h1 className="font-display text-xl font-semibold">Waiting for approval</h1>
        <p className="mt-2 text-sm text-muted">
          Your account exists but has not been activated by an administrator yet.
          You&apos;ll get an email notification the moment your access is approved.
        </p>
        <p className="mt-4 text-xs text-muted">
          Wrong email or urgent access? Contact your department administrator.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm text-primary underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
