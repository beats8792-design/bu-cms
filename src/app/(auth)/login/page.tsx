import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
      <h1 className="font-display text-xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-muted">Use your university email.</p>
      <div className="mt-6">
        <LoginForm />
      </div>
    </div>
  );
}
