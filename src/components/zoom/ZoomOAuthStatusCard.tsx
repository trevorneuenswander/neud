import type { ReactNode } from "react";

type ZoomOAuthTone = "primary" | "warning" | "danger";

const toneClass: Record<ZoomOAuthTone, string> = {
  primary: "bg-primary/15 text-primary",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
};

type ZoomOAuthStatusCardProps = {
  heading: string;
  description: string;
  tone: ZoomOAuthTone;
  icon: ReactNode;
  progress?: boolean;
  action?: ReactNode;
  footnote?: string;
};

export function ZoomOAuthStatusCard({
  heading,
  description,
  tone,
  icon,
  progress = false,
  action,
  footnote,
}: ZoomOAuthStatusCardProps) {
  return (
    <div className="relative flex min-h-full items-center justify-center px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(59, 130, 246, 0.18), transparent 58%)",
        }}
      />
      <section className="relative w-full max-w-[440px] rounded-2xl border border-border bg-surface px-8 pb-8 pt-10 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.34em] text-foreground">NEUD</p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-muted">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 8h10a2 2 0 0 1 2 2v6H6a2 2 0 0 1-2-2V8zm12 3 4-2v8l-4-2"
            />
          </svg>
          Zoom
        </p>
        <div
          className={`mx-auto mt-7 grid h-14 w-14 place-items-center rounded-full ${toneClass[tone]}`}
        >
          {icon}
        </div>
        <h1 className="mt-5 text-[1.75rem] font-semibold tracking-tight text-foreground">
          {heading}
        </h1>
        <p className="mt-2 text-base leading-relaxed text-muted">{description}</p>
        {progress ? (
          <div className="mx-auto mt-6 h-1 w-28 overflow-hidden rounded-full bg-primary/20">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
          </div>
        ) : null}
        {action ? <div className="mt-6">{action}</div> : null}
        {footnote ? <p className="mt-6 text-sm text-muted">{footnote}</p> : null}
      </section>
    </div>
  );
}
