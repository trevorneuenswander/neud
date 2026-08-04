import { DisclosureSection } from "@/components/ui/DisclosureSection";
import type {
  DataEngine,
  DataEngineCommand,
  DataEngineSnapshot,
  DataEngineStatus,
  WebpageScraperSettings,
  WebpageScraperSource,
} from "@/lib/data-engines/types";
import { calculateEngineHealth } from "@/lib/data-engines/health";

type DeveloperDrawerProps = {
  engine: DataEngine;
  projectId: string;
  status: DataEngineStatus | null;
  settings: WebpageScraperSettings | null;
  sources: WebpageScraperSource[];
  latestSnapshot: DataEngineSnapshot | null;
  latestCommand: DataEngineCommand | null;
  pendingCount: number;
  canConfigure: boolean;
};

export function DeveloperDrawer({
  engine,
  projectId,
  status,
  settings,
  sources,
  latestSnapshot,
  latestCommand,
  pendingCount,
  canConfigure,
}: DeveloperDrawerProps) {
  if (!canConfigure) return null;

  const health = status
    ? calculateEngineHealth(
        status,
        engine.desired_state,
        settings?.poll_interval_ms ?? null,
        latestSnapshot,
      )
    : "unknown";

  return (
    <DisclosureSection title="Developer Tools" contentClassName="pt-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted">Engine ID</dt><dd className="break-all font-mono text-xs">{engine.id}</dd></div>
        <div><dt className="text-muted">Project ID</dt><dd className="break-all font-mono text-xs">{projectId}</dd></div>
        <div><dt className="text-muted">Desired state</dt><dd>{engine.desired_state}</dd></div>
        <div><dt className="text-muted">Actual state</dt><dd>{status?.actual_state ?? "—"}</dd></div>
        <div><dt className="text-muted">Health state</dt><dd>{health}</dd></div>
        <div><dt className="text-muted">Worker ID</dt><dd className="break-all">{status?.worker_id ?? "—"}</dd></div>
        <div><dt className="text-muted">Worker version</dt><dd>{status?.worker_version ?? "—"}</dd></div>
        <div><dt className="text-muted">Poll interval</dt><dd>{settings?.poll_interval_ms ?? "—"} ms</dd></div>
        <div><dt className="text-muted">Active commands</dt><dd>{pendingCount}</dd></div>
        <div><dt className="text-muted">Latest command</dt><dd>{latestCommand?.command ?? "—"}</dd></div>
        <div><dt className="text-muted">Latest snapshot ID</dt><dd>{latestSnapshot?.id ?? "—"}</dd></div>
        <div><dt className="text-muted">Latest error</dt><dd>{status?.last_error ?? "—"}</dd></div>
        <div className="sm:col-span-2">
          <dt className="text-muted">Sources</dt>
          <dd>{sources.map((source) => source.source_key).join(", ") || "—"}</dd>
        </div>
      </dl>
    </DisclosureSection>
  );
}
