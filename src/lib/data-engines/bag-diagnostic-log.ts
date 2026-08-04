import type { DataEngineLog, DataEngineStatus } from "@/lib/data-engines/types";

export type ScrapeRunMetadata = {
  startedAt?: string;
  completedAt?: string;
  durationMs?: number | null;
  listingRowCount?: number | null;
  listingUrl?: string | null;
  auctionDisplayUrl?: string | null;
  detailChecksAttempted?: number | null;
  detailChecksSucceeded?: number | null;
  detailCheckFailures?: number | null;
  auctionDisplayStatus?: string | null;
  authenticationStatus?: string | null;
  cookieStatus?: string | null;
  currentSession?: string | null;
  currentActiveLot?: string | null;
  previousLot?: string | null;
  nextLots?: string[] | null;
  lastSoldLot?: string | null;
  legacyComparisonWarnings?: string[] | null;
  runType?: string | null;
  error?: string | null;
  step?: string | null;
  broadArrowRuntimeVersion?: string | null;
  auctionTableFound?: boolean | null;
  loginRouteRemaining?: boolean | null;
  auctionDisplayFound?: boolean | null;
};

export type EngineDisplayState = "Running" | "Idle" | "Stopped" | "Stopping" | "Error";

export function isBagDiagnosticLog(log: DataEngineLog): boolean {
  return log.event_type === "bag.diagnostic";
}

export function formatBagDiagnosticTime(value: string): string {
  try {
    return new Date(value).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "--:--:--";
  }
}

export function getEngineDisplayState(input: {
  actualState: string | null | undefined;
  desiredState: "running" | "stopped";
  lastError?: string | null;
}): EngineDisplayState {
  const actual = input.actualState ?? "offline";

  if (actual === "error") {
    return "Error";
  }

  if (actual === "stopping") {
    return "Stopping";
  }

  if (actual === "running" || actual === "starting") {
    return "Running";
  }

  if (input.desiredState === "running") {
    return "Idle";
  }

  return "Stopped";
}

export function getPollingCountdownSeconds(input: {
  status: DataEngineStatus | null;
  pollIntervalMs: number | null;
  actualState: string | null | undefined;
  desiredState: "running" | "stopped";
}): number | null {
  if (input.desiredState !== "running") {
    return null;
  }

  if (input.actualState !== "running" && input.actualState !== "starting") {
    return null;
  }

  const intervalMs = input.pollIntervalMs ?? input.status?.current_interval_ms ?? null;
  const anchor =
    input.status?.last_run_succeeded_at ??
    input.status?.last_run_started_at ??
    input.status?.last_heartbeat_at ??
    null;

  if (!intervalMs || !anchor) {
    return null;
  }

  const elapsedMs = Date.now() - new Date(anchor).getTime();
  const remainingMs = Math.max(0, intervalMs - elapsedMs);
  return Math.ceil(remainingMs / 1000);
}

export function findLatestScrapeMetadata(
  logs: DataEngineLog[],
): ScrapeRunMetadata | null {
  const latest = logs.find(
    (log) =>
      log.event_type === "scrape.completed" || log.event_type === "scrape.failed",
  );

  if (!latest?.metadata || typeof latest.metadata !== "object") {
    return null;
  }

  return latest.metadata as ScrapeRunMetadata;
}

export function getBagDiagnosticLogs(logs: DataEngineLog[]): DataEngineLog[] {
  return logs
    .filter(isBagDiagnosticLog)
    .slice()
    .reverse();
}

function isExecutionLogEvent(log: DataEngineLog): boolean {
  return (
    isBagDiagnosticLog(log) ||
    log.event_type === "scrape.failed" ||
    log.event_type === "engine.execution"
  );
}

export function getExecutionLogEntries(logs: DataEngineLog[]): DataEngineLog[] {
  const structured = getBagDiagnosticLogs(logs);
  const failures = logs
    .filter((log) => log.event_type === "scrape.failed")
    .slice()
    .reverse()
    .map((log) => ({
      ...log,
      message:
        typeof log.metadata?.step === "string"
          ? `Stage failed: ${log.metadata.step}. ${log.message}`
          : log.message,
    }));
  const executionEvents = logs
    .filter((log) => log.event_type === "engine.execution")
    .slice()
    .reverse();

  return [...structured, ...failures, ...executionEvents]
    .filter(isExecutionLogEvent)
    .sort(
      (left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
    );
}

export function filterSessionExecutionLogs(
  logs: DataEngineLog[],
  sessionCutoffMs: number,
): DataEngineLog[] {
  return getExecutionLogEntries(logs).filter(
    (log) => new Date(log.created_at).getTime() >= sessionCutoffMs,
  );
}

export function getRunOnceStageFromLogs(
  logs: DataEngineLog[],
  queuedAt: number | null,
): string | null {
  if (!queuedAt) return null;

  const recent = logs.filter(
    (log) => new Date(log.created_at).getTime() >= queuedAt - 1000,
  );

  const failed = recent.find(
    (log) =>
      log.event_type === "scrape.failed" ||
      (isBagDiagnosticLog(log) && log.metadata?.failed === true),
  );
  if (failed) return "failed";

  const stages = recent
    .filter(isBagDiagnosticLog)
    .map((log) =>
      typeof log.metadata?.stage === "string" ? log.metadata.stage : null,
    )
    .filter(Boolean) as string[];

  if (stages.includes("pipeline.complete")) return "complete";
  if (stages.includes("live_state.update")) return "updating-live-state";
  if (stages.includes("snapshot.write")) return "writing-snapshot";
  if (
    stages.some(
      (stage) =>
        stage.startsWith("vehicles.") ||
        stage.startsWith("lots.") ||
        stage.startsWith("details.") ||
        stage.startsWith("auction_display.") ||
        stage.startsWith("last_sold") ||
        stage.startsWith("login") ||
        stage.startsWith("cookie") ||
        stage.startsWith("session."),
    )
  ) {
    return "scraping";
  }
  if (stages.includes("engine.start")) return "starting";

  return null;
}
