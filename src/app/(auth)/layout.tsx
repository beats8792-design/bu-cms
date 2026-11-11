import Link from "next/link";

/** Centered card shell for all auth pages. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg px-4 py-10">
      <Link href="/" className="font-display text-lg font-semibold text-primary">
        Jazbah UCMS
      </Link>
      {children}
    </div>
  );
}
