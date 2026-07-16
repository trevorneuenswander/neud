type PageSectionProps = {
  title?: string;
  children: React.ReactNode;
  className?: string;
};

export function PageSection({ title, children, className = "" }: PageSectionProps) {
  return (
    <section className={`space-y-4 ${className}`}>
      {title ? (
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {title}
        </h3>
      ) : null}
      {children}
    </section>
  );
}
