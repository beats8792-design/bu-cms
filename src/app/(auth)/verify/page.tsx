import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Verify your email" };

export default function VerifyPage() {
  return (
    <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
      <h1 className="font-display text-xl font-semibold">Email verified</h1>
      <p className="mt-2 text-sm text-muted">
        Your email is confirmed. Your account is still awaiting administrator approval —
        you will be able to sign in once it is activated.
      </p>
      <Link href="/login" className={`${buttonClass("primary", "md")} mt-6`}>
        Sign in
      </Link>
    </div>
  );
}
