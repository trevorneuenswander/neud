import {
  ENGINE_STATUS_CARD_CLASS,
  ENGINE_STATUS_LABEL_CLASS,
  EngineStatusCardShell,
  EngineStatusLabelPill,
} from "@/components/data-engines/webpage-scraper/EngineStatusCard";
import {
  formatAbsoluteDateTime,
  formatDurationMs,
  formatHealthState,
  formatPollInterval,
} from "@/lib/data-engines/format";
import { useEngineLastPollAt } from "@/lib/data-engines/engine-status-session-client";
import type { EngineHealthState } from "@/lib/data-engines/constants";
import type { DataEngineLog, DataEngineStatus } from "@/lib/data-engines/types";
import type { ScrapeRunMetadata } from "@/lib/data-engines/bag-diagnostic-log";

type RuntimeDiagnosticsProps = {
  status: DataEngineStatus | null;
  logs: DataEngineLog[];
  pollIntervalMs?: number | null;
  actualState?: string | null;
  health?: EngineHealthState;
  embedded?: boolean;
  engineId?: string | null;
};

const HEALTH_STYLES: Record<EngineHealthState, string> = {
  unknown: "border-border bg-surface-raised text-muted",
  healthy: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  error: "border-danger/30 bg-danger/10 text-danger",
  stale: "border-warning/30 bg-warning/10 text-warning",
};

function parseRunMetadata(log: DataEngineLog | undefined): ScrapeRunMetadata | null {
  if (!log?.metadata || typeof log.metadata !== "object") {
    return null;
  }
  return log.metadata as ScrapeRunMetadata;
}

function findLatestScrapeLog(logs: DataEngineLog[]): DataEngineLog | undefined {
  return logs.find(
    (log) => log.event_type === "scrape.completed" || log.event_type === "scrape.failed",
  );
}

function findLatestStopLog(logs: DataEngineLog[]): DataEngineLog | undefined {
  return logs.find(
    (log) =>
      log.event_type === "engine.stop.failed" ||
      log.event_type === "engine.stop.requested" ||
      log.event_type === "engine.execution",
  );
}

function findLatestLoginFailureLog(logs: DataEngineLog[]): DataEngineLog | undefined {
  return logs.find(
    (log) =>
      log.event_type === "bag.diagnostic" &&
      log.metadata?.failed === true &&
      typeof log.metadata?.loginFailureScreenshot === "string",
  );
}

function formatLastPollAbsolute(value: string | null): string {
  return formatAbsoluteDateTime(value);
}

function DiagnosticRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="break-words text-foreground">{value}</dd>
    </div>
  );
}

function RuntimeStatusSummary({
  health,
  lastPollAt,
}: {
  health: EngineHealthState;
  lastPollAt: string | null;
}) {
  const healthStyle = HEALTH_STYLES[health] ?? HEALTH_STYLES.unknown;

  return (
    <EngineStatusCardShell
      leading={
        <EngineStatusLabelPill label="Engine Health" pillClassName={healthStyle}>
          {formatHealthState(health)}
        </EngineStatusLabelPill>
      }
      trailing={
        <div className="min-w-0">
          <p className={`${ENGINE_STATUS_LABEL_CLASS} leading-none`}>Last Poll</p>
          <p className="mt-0.5 break-words text-sm leading-snug text-muted">
            {formatLastPollAbsolute(lastPollAt)}
          </p>
        </div>
      }
    />
  );
}

export function RuntimeDiagnostics({
  status,
  logs,
  pollIntervalMs = null,
  actualState = null,
  health = "unknown",
  embedded = false,
  engineId = null,
}: RuntimeDiagnosticsProps) {
  const { lastPollAt: sessionLastPollAt } = useEngineLastPollAt(engineId);
  const latestLog = findLatestScrapeLog(logs);
  const latestStopLog = findLatestStopLog(logs);
  const latestLoginFailureLog = findLatestLoginFailureLog(logs);
  const loginFailureScreenshot =
    typeof latestLoginFailureLog?.metadata?.loginFailureScreenshot === "string"
      ? latestLoginFailureLog.metadata.loginFailureScreenshot
      : null;
  const metadata = parseRunMetadata(latestLog);

  const lastSuccessfulPoll =
    sessionLastPollAt ??
    status?.last_run_succeeded_at ??
    metadata?.completedAt ??
    null;

  const content = (
    <>
      {!embedded ? (
        <h4 className="text-sm font-medium text-foreground">Runtime diagnostics</h4>
      ) : null}
      <RuntimeStatusSummary health={health} lastPollAt={lastSuccessfulPoll} />
      <dl className={`grid gap-2 text-sm sm:grid-cols-2 ${embedded ? "mt-4" : "mt-3"}`}>
        <DiagnosticRow
          label="Broad Arrow runtime"
          value={metadata?.broadArrowRuntimeVersion ?? "Unknown"}
        />
        <DiagnosticRow
          label="Authentication status"
          value={metadata?.authenticationStatus ?? "Unknown"}
        />
        <DiagnosticRow
          label="Cookie status"
          value={metadata?.cookieStatus ?? "Unknown"}
        />
        <DiagnosticRow
          label="Current session"
          value={metadata?.currentSession ?? "Unknown"}
        />
        <DiagnosticRow
          label="Auction Table URL"
          value={metadata?.listingUrl ?? "Unknown"}
        />
        <DiagnosticRow
          label="Auction display URL"
          value={metadata?.auctionDisplayUrl ?? "Unknown"}
        />
        <DiagnosticRow
          label="Rows found"
          value={
            metadata?.listingRowCount != null
              ? String(metadata.listingRowCount)
              : status?.last_record_count != null
                ? String(status.last_record_count)
                : "Unknown"
          }
        />
        <DiagnosticRow
          label="Current active lot"
          value={metadata?.currentActiveLot ?? "—"}
        />
        <DiagnosticRow
          label="Previous lot"
          value={metadata?.previousLot ?? "—"}
        />
        <DiagnosticRow
          label="Next lots"
          value={formatList(metadata?.nextLots ?? undefined)}
        />
        <DiagnosticRow
          label="Last sold"
          value={metadata?.lastSoldLot ?? "—"}
        />
        <DiagnosticRow
          label="Auction display status"
          value={metadata?.auctionDisplayStatus ?? "Unknown"}
        />
        <DiagnosticRow
          label="Detail pages checked"
          value={
            metadata?.detailChecksAttempted != null
              ? `${metadata.detailChecksSucceeded ?? 0}/${metadata.detailChecksAttempted}`
              : "Unknown"
          }
        />
        <DiagnosticRow
          label="Scrape duration"
          value={
            metadata?.durationMs != null
              ? formatDurationMs(metadata.durationMs)
              : status?.last_duration_ms != null
                ? formatDurationMs(status.last_duration_ms)
                : "Unknown"
          }
        />
        <DiagnosticRow
          label="Polling interval"
          value={formatPollInterval(pollIntervalMs)}
        />
        {actualState === "stopping" || latestStopLog ? (
          <DiagnosticRow
            label="Shutdown stage"
            value={
              latestStopLog?.event_type === "engine.stop.failed"
                ? latestStopLog.message
                : latestStopLog?.message ?? "Stopping worker and closing browser."
            }
          />
        ) : null}
        {loginFailureScreenshot ? (
          <div className="sm:col-span-2">
            <dt className="text-muted">Login failure screenshot</dt>
            <dd className="break-all font-mono text-xs text-foreground">
              {loginFailureScreenshot}
            </dd>
          </div>
        ) : null}
        {metadata?.legacyComparisonWarnings?.length ? (
          <div className="sm:col-span-2">
            <dt className="text-muted">Legacy comparison</dt>
            <dd className="space-y-1 text-warning">
              {metadata.legacyComparisonWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className={ENGINE_STATUS_CARD_CLASS}>
      {content}
    </div>
  );
}

function formatList(values: string[] | null | undefined): string {
  if (!values?.length) return "—";
  return values.join(", ");
}
