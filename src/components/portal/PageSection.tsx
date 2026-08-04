type PageSectionProps = {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function PageSection({
  title,
  actions,
  children,
  className = "",
}: PageSectionProps) {
  return (
    <section className={`space-y-4 ${className}`}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {title}
          </h3>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}
