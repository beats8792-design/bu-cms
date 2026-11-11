import type { Metadata } from "next";
import Link from "next/link";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Bulk import" };

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/users" className="text-sm text-primary underline">
        ← Back to users
      </Link>
      <h1 className="mt-3 font-display text-2xl font-semibold">Bulk import accounts</h1>
      <p className="mt-2 text-sm text-muted">
        Header row required. Columns: <code>name</code>, <code>email</code> (required);
        <code> role</code> (student/teacher), <code>studentId</code> (optional). Duplicate or
        existing emails are skipped. New accounts start <strong>pending</strong> and unverified;
        they set their password with &ldquo;Forgot password&rdquo; on first sign-in after
        verification and approval.
      </p>
      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <ImportForm />
      </div>
    </div>
  );
}
