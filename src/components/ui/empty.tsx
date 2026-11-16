/**
 * EmptyState (DESIGN.md §5): honest heading + one sentence of guidance +
 * optional primary action. No emoji, no stock art.
 */

interface EmptyStateProps {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, children, action, className }: EmptyStateProps) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface p-6${className ? ` ${className}` : ""}`}
    >
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {children ? <p className="mt-1 text-sm text-muted">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
