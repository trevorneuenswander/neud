import { EngineHealthBadge } from "@/components/data-engines/EngineHealthBadge";
import { EngineStateBadge } from "@/components/data-engines/EngineStateBadge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { calculateEngineHealth } from "@/lib/data-engines/health";
import {
  formatEngineType,
  formatPollInterval,
  formatRelativeTime,
} from "@/lib/data-engines/format";
import type { DataEngineListItem } from "@/lib/data-engines/types";

type DataEngineCardProps = {
  projectSlug: string;
  engine: DataEngineListItem;
};

export function DataEngineCard({ projectSlug, engine }: DataEngineCardProps) {
  const pollInterval = engine.settings?.poll_interval_ms ?? null;
  const health = calculateEngineHealth(
    engine.status,
    engine.desired_state,
    pollInterval,
    null,
  );

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{engine.name}</h3>
          <p className="mt-1 text-sm text-muted">{formatEngineType(engine.engine_type)}</p>
        </div>
        <EngineHealthBadge health={health} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <EngineStateBadge state={engine.status.actual_state} />
        <span className="text-xs text-muted">
          Desired: {engine.desired_state === "running" ? "Running" : "Stopped"}
        </span>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Last heartbeat</dt>
          <dd className="text-foreground">
            {formatRelativeTime(engine.status.last_heartbeat_at)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Last successful run</dt>
          <dd className="text-foreground">
            {formatRelativeTime(engine.status.last_run_succeeded_at)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Poll rate</dt>
          <dd className="text-foreground">{formatPollInterval(pollInterval)}</dd>
        </div>
      </dl>

      <div className="mt-6">
        <Button
          href={`/projects/${projectSlug}/data-engines/${engine.id}`}
          variant="secondary"
          size="sm"
        >
          Open Engine
        </Button>
      </div>
    </Card>
  );
}
