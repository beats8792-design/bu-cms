import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-4xl flex-col px-6">
      <header className="flex h-14 shrink-0 items-center">
        <span className="font-display text-base font-semibold text-primary">Jazbah UCMS</span>
      </header>

      <main className="flex flex-1 flex-col justify-center py-12">
        <h1 className="font-display text-4xl font-semibold tracking-tight">
          Your entire course life, in one calm place.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          Courses, materials, assignments, attendance, marks and results — plus an
          AI study assistant for every lecture. Built for university life.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Open the app
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink hover:bg-primary-soft"
          >
            Sign in (Phase 1)
          </Link>
        </div>

        <dl className="mt-12 grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
          {[
            ["30 MB", "materials & submissions"],
            ["5 roles", "admin · teacher · CR · student · alumni"],
            ["AI-assisted", "notes, quizzes, planning"],
          ].map(([stat, label]) => (
            <div
              key={label}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <dt className="text-muted">{label}</dt>
              <dd className="mt-1 font-display text-lg font-semibold">{stat}</dd>
            </div>
          ))}
        </dl>
      </main>

      <footer className="h-14 shrink-0 text-xs text-muted">
        Status, setup and roadmap live in the project Brain.
      </footer>
    </div>
  );
}
