import type { ReactNode } from "react";

export const ENGINE_STATUS_CARD_CLASS =
  "rounded-lg border border-border bg-surface-raised/40 p-4";

export const ENGINE_STATUS_CARD_ROW_CLASS =
  "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between";

export const ENGINE_STATUS_LABEL_CLASS =
  "text-xs uppercase tracking-wide text-muted";

export const ENGINE_STATUS_PILL_CLASS =
  "inline-flex rounded-full border px-3 py-1 text-sm font-medium";

type EngineStatusLabelPillProps = {
  label: string;
  pillClassName: string;
  children: ReactNode;
};

export function EngineStatusLabelPill({
  label,
  pillClassName,
  children,
}: EngineStatusLabelPillProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className={ENGINE_STATUS_LABEL_CLASS}>{label}</p>
      <span className={`${ENGINE_STATUS_PILL_CLASS} ${pillClassName}`}>
        {children}
      </span>
    </div>
  );
}

type EngineStatusCardShellProps = {
  leading: ReactNode;
  trailing?: ReactNode;
};

export function EngineStatusCardShell({ leading, trailing }: EngineStatusCardShellProps) {
  return (
    <div className={ENGINE_STATUS_CARD_CLASS}>
      <div className={ENGINE_STATUS_CARD_ROW_CLASS}>
        <div className="min-w-0 flex-1">{leading}</div>
        {trailing ? (
          <div className="min-w-0 shrink-0 sm:text-right">{trailing}</div>
        ) : null}
      </div>
    </div>
  );
}
