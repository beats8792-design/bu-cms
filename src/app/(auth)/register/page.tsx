import type { Metadata } from "next";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Register" };

export default function RegisterPage() {
  // Raw env read (not serverEnv()) — this page prerenders at build without env.
  const mailerOn = Boolean(process.env.RESEND_API_KEY);
  return (
    <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-card">
      <h1 className="font-display text-xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-muted">Student and teacher accounts are approved by your administrator.</p>
      <div className="mt-6">
        <RegisterForm mailerOn={mailerOn} />
      </div>
    </div>
  );
}
