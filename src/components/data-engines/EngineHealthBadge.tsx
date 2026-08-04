import type { EngineHealthState } from "@/lib/data-engines/constants";
import { formatHealthState } from "@/lib/data-engines/format";

const healthStyles: Record<EngineHealthState, string> = {
  unknown: "border-border bg-surface-raised text-muted",
  healthy: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  error: "border-danger/30 bg-danger/10 text-danger",
  stale: "border-warning/30 bg-warning/10 text-warning",
};

type EngineHealthBadgeProps = {
  health: EngineHealthState;
};

export function EngineHealthBadge({ health }: EngineHealthBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${healthStyles[health]}`}
    >
      {formatHealthState(health)}
    </span>
  );
}
