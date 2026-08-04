import type {
  DataEngineSnapshot,
  DataEngineStatus,
} from "@/lib/data-engines/types";
import type { EngineHealthState } from "@/lib/data-engines/constants";
import {
  isTimestampSinceStartOfLocalDay,
  localStatsDayKey,
  startOfDayInLocalTimezone,
} from "@/lib/time/local-day";

export {
  isTimestampSinceStartOfLocalDay,
  localStatsDayKey,
  startOfDayInLocalTimezone,
};

const STALE_MULTIPLIER = 3;

export function calculateEngineHealth(
  status: DataEngineStatus,
  engineDesiredState: "running" | "stopped",
  pollIntervalMs: number | null,
  latestSnapshot: DataEngineSnapshot | null,
): EngineHealthState {
  const now = Date.now();
  const interval = pollIntervalMs ?? status.current_interval_ms ?? 5000;
  const heartbeatAge = status.last_heartbeat_at
    ? now - new Date(status.last_heartbeat_at).getTime()
    : null;
  const successAge = status.last_run_succeeded_at
    ? now - new Date(status.last_run_succeeded_at).getTime()
    : null;
  const snapshotAge = latestSnapshot
    ? now - new Date(latestSnapshot.captured_at).getTime()
    : null;

  if (status.actual_state === "error") {
    return "error";
  }

  if (
    engineDesiredState === "running" &&
    (status.actual_state === "offline" || status.actual_state === "stopped")
  ) {
    return "error";
  }

  if (status.failed_runs >= 3 && status.successful_runs === 0) {
    return "error";
  }

  if (heartbeatAge !== null && heartbeatAge > interval * STALE_MULTIPLIER) {
    return "stale";
  }

  if (snapshotAge !== null && snapshotAge > interval * STALE_MULTIPLIER) {
    return "stale";
  }

  if (
    engineDesiredState === "running" &&
    status.actual_state === "running" &&
    heartbeatAge !== null &&
    heartbeatAge <= interval * 2 &&
    successAge !== null &&
    successAge <= interval * STALE_MULTIPLIER
  ) {
    return "healthy";
  }

  if (status.last_run_failed_at) {
    const failedAge = now - new Date(status.last_run_failed_at).getTime();
    if (failedAge < interval * 2) {
      return "warning";
    }
  }

  if (
    engineDesiredState !== status.actual_state &&
    !["offline", "stopped"].includes(status.actual_state)
  ) {
    return "warning";
  }

  if (status.actual_state === "running") {
    return heartbeatAge !== null && heartbeatAge <= interval * 2
      ? "healthy"
      : "warning";
  }

  return "unknown";
}

export function isSnapshotStale(
  snapshot: DataEngineSnapshot | null,
  pollIntervalMs: number,
): boolean {
  if (!snapshot) return true;
  const age = Date.now() - new Date(snapshot.captured_at).getTime();
  return age > pollIntervalMs * STALE_MULTIPLIER;
}

export function countScrapesToday(
  snapshots: DataEngineSnapshot[],
  logs: Array<{ event_type?: string | null; created_at: string }> = [],
  now = new Date(),
): number {
  const startOfDay = startOfDayInLocalTimezone(now);
  const completedSnapshots = snapshots.filter((snapshot) => {
    const captured = new Date(snapshot.captured_at);
    return (
      !Number.isNaN(captured.getTime()) &&
      captured >= startOfDay &&
      captured <= now
    );
  }).length;
  const failedAttempts = logs.filter(
    (log) =>
      log.event_type === "scrape.failed" &&
      isTimestampSinceStartOfLocalDay(log.created_at, now),
  ).length;
  return completedSnapshots + failedAttempts;
}

/** Counts all completed scrape attempts today (automatic and Run Once). */
export function countSuccessfulToday(
  snapshots: DataEngineSnapshot[],
  now = new Date(),
): number {
  const startOfDay = startOfDayInLocalTimezone(now);
  return snapshots.filter((snapshot) => {
    const captured = new Date(snapshot.captured_at);
    return (
      !Number.isNaN(captured.getTime()) &&
      captured >= startOfDay &&
      captured <= now
    );
  }).length;
}

export function countFailedToday(
  logs: Array<{ event_type?: string | null; created_at: string }>,
  now = new Date(),
): number {
  return logs.filter(
    (log) =>
      log.event_type === "scrape.failed" &&
      isTimestampSinceStartOfLocalDay(log.created_at, now),
  ).length;
}

export type DailyScrapeCounts = {
  total: number;
  successful: number;
  failed: number;
};

export function resolveDailyScrapeCounts(input: {
  status: Pick<
    DataEngineStatus,
    "scrapes_today" | "successful_today" | "failed_today" | "stats_day"
  >;
  snapshots: DataEngineSnapshot[];
  logs: Array<{ event_type?: string | null; created_at: string }>;
  now?: Date;
}): DailyScrapeCounts {
  const now = input.now ?? new Date();
  const todayKey = localStatsDayKey(now);
  const persistedDay =
    typeof input.status.stats_day === "string" ? input.status.stats_day : null;
  const persistedIsToday = persistedDay === todayKey;

  if (
    persistedIsToday &&
    typeof input.status.scrapes_today === "number" &&
    typeof input.status.successful_today === "number" &&
    typeof input.status.failed_today === "number"
  ) {
    return {
      total: input.status.scrapes_today,
      successful: input.status.successful_today,
      failed: input.status.failed_today,
    };
  }

  const successful = countSuccessfulToday(input.snapshots, now);
  const failed = countFailedToday(input.logs, now);
  return {
    total: countScrapesToday(input.snapshots, input.logs, now),
    successful,
    failed,
  };
}

const AVERAGE_POLL_RATE_MAX_INTERVALS = 100;
const POLL_GAP_GRACE_MS = 30_000;

type PollTimingLog = {
  event_type?: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

export type AveragePollRateDiagnostics = {
  qualifyingPollCount: number;
  acceptedIntervalCount: number;
  rejectedIntervalCount: number;
  averageIntervalMs: number | null;
  oldestIncludedPollAtMs: number | null;
  newestIncludedPollAtMs: number | null;
  rejectionReasons: {
    gapTooLarge: number;
    nonPositive: number;
  };
};

function isScheduledPollAttempt(log: PollTimingLog): boolean {
  if (log.metadata?.runType === "run_once") {
    return false;
  }

  return log.event_type === "scrape.completed" || log.event_type === "scrape.failed";
}

function resolvePollStartedAtMs(log: PollTimingLog): number | null {
  const metadataStartedAt = log.metadata?.startedAt;
  if (typeof metadataStartedAt === "string") {
    const startedAtMs = Date.parse(metadataStartedAt);
    if (Number.isFinite(startedAtMs)) {
      return startedAtMs;
    }
  }

  const completedAtMs = Date.parse(log.created_at);
  if (!Number.isFinite(completedAtMs)) {
    return null;
  }

  const durationMs =
    typeof log.metadata?.durationMs === "number" && log.metadata.durationMs >= 0
      ? log.metadata.durationMs
      : 0;

  return completedAtMs - durationMs;
}

function resolveMaxAllowedIntervalMs(configuredIntervalMs: number | null): number {
  const configuredPollIntervalMs = configuredIntervalMs ?? 5000;
  return Math.max(configuredPollIntervalMs * 3, configuredPollIntervalMs + POLL_GAP_GRACE_MS);
}

export function calculateAveragePollRateWithDiagnostics(
  logs: PollTimingLog[],
  configuredIntervalMs: number | null = null,
  maxIntervals = AVERAGE_POLL_RATE_MAX_INTERVALS,
): AveragePollRateDiagnostics {
  const pollStartedAtMsList = logs
    .filter(isScheduledPollAttempt)
    .map(resolvePollStartedAtMs)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);

  const uniquePollStartedAtMsList = [...new Set(pollStartedAtMsList)];

  if (uniquePollStartedAtMsList.length < 2) {
    return {
      qualifyingPollCount: uniquePollStartedAtMsList.length,
      acceptedIntervalCount: 0,
      rejectedIntervalCount: 0,
      averageIntervalMs: null,
      oldestIncludedPollAtMs: uniquePollStartedAtMsList[0] ?? null,
      newestIncludedPollAtMs:
        uniquePollStartedAtMsList[uniquePollStartedAtMsList.length - 1] ?? null,
      rejectionReasons: {
        gapTooLarge: 0,
        nonPositive: 0,
      },
    };
  }

  const maxAllowedIntervalMs = resolveMaxAllowedIntervalMs(configuredIntervalMs);
  const acceptedIntervalsMs: number[] = [];
  const rejectionReasons = {
    gapTooLarge: 0,
    nonPositive: 0,
  };

  for (let index = 1; index < uniquePollStartedAtMsList.length; index += 1) {
    const previousPollStartedAtMs = uniquePollStartedAtMsList[index - 1]!;
    const pollStartedAtMs = uniquePollStartedAtMsList[index]!;
    const intervalMs = pollStartedAtMs - previousPollStartedAtMs;

    if (intervalMs <= 0) {
      rejectionReasons.nonPositive += 1;
      continue;
    }

    if (intervalMs > maxAllowedIntervalMs) {
      rejectionReasons.gapTooLarge += 1;
      continue;
    }

    acceptedIntervalsMs.push(intervalMs);
  }

  const recentAcceptedIntervalsMs = acceptedIntervalsMs.slice(-maxIntervals);
  const averageIntervalMs =
    recentAcceptedIntervalsMs.length > 0
      ? recentAcceptedIntervalsMs.reduce((sum, intervalMs) => sum + intervalMs, 0) /
        recentAcceptedIntervalsMs.length
      : null;

  const includedPollCount = recentAcceptedIntervalsMs.length + 1;
  const oldestIncludedPollAtMs =
    includedPollCount > 0
      ? uniquePollStartedAtMsList[uniquePollStartedAtMsList.length - includedPollCount] ?? null
      : null;
  const newestIncludedPollAtMs =
    uniquePollStartedAtMsList[uniquePollStartedAtMsList.length - 1] ?? null;

  return {
    qualifyingPollCount: uniquePollStartedAtMsList.length,
    acceptedIntervalCount: recentAcceptedIntervalsMs.length,
    rejectedIntervalCount:
      rejectionReasons.gapTooLarge + rejectionReasons.nonPositive,
    averageIntervalMs,
    oldestIncludedPollAtMs,
    newestIncludedPollAtMs,
    rejectionReasons,
  };
}

export function calculateAveragePollRateMs(
  logs: PollTimingLog[],
  configuredIntervalMs: number | null = null,
  maxIntervals = AVERAGE_POLL_RATE_MAX_INTERVALS,
): number | null {
  return calculateAveragePollRateWithDiagnostics(
    logs,
    configuredIntervalMs,
    maxIntervals,
  ).averageIntervalMs;
}
