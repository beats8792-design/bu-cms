/** Shared placeholder for modules that arrive in later phases. */
export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="mx-auto max-w-3xl rounded-lg border border-border bg-surface p-6">
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted">
        This area opens in {phase}. The design-system tokens for it are already live.
      </p>
    </div>
  );
}
