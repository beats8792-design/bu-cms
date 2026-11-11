import type { Metadata } from "next";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-card">
      <h1 className="font-display text-xl font-semibold">Forgot your password?</h1>
      <p className="mt-1 text-sm text-muted">We&apos;ll email you a link to set a new one.</p>
      <div className="mt-6">
        <ForgotForm />
      </div>
    </div>
  );
}
