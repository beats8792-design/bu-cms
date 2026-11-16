import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Account suspended" };

export default function SuspendedPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
        <h1 className="font-display text-xl font-semibold">Account suspended</h1>
        <p className="mt-2 text-sm text-muted">
          This account has been suspended by an administrator. Contact your department
          office if you believe this is a mistake.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm text-primary underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
