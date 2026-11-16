/**
 * PageHeader (DESIGN.md §3/§6): the one h1 per page, optional muted intro,
 * optional right-aligned action row.
 */

interface PageHeaderProps {
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ title, children, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        {children ? <p className="mt-1 text-sm text-muted">{children}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
