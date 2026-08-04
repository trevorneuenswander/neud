import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const AVERAGE_POLL_RATE_MAX_INTERVALS = 100;
const POLL_GAP_GRACE_MS = 30_000;

function isScheduledPollAttempt(log) {
  if (log.metadata?.runType === "run_once") {
    return false;
  }

  return log.event_type === "scrape.completed" || log.event_type === "scrape.failed";
}

function resolvePollStartedAtMs(log) {
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

function resolveMaxAllowedIntervalMs(configuredIntervalMs) {
  const configuredPollIntervalMs = configuredIntervalMs ?? 5000;
  return Math.max(configuredPollIntervalMs * 3, configuredPollIntervalMs + POLL_GAP_GRACE_MS);
}

function calculateAveragePollRateWithDiagnostics(
  logs,
  configuredIntervalMs = null,
  maxIntervals = AVERAGE_POLL_RATE_MAX_INTERVALS,
) {
  const pollStartedAtMsList = logs
    .filter(isScheduledPollAttempt)
    .map(resolvePollStartedAtMs)
    .filter((value) => value !== null)
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
  const acceptedIntervalsMs = [];
  const rejectionReasons = {
    gapTooLarge: 0,
    nonPositive: 0,
  };

  for (let index = 1; index < uniquePollStartedAtMsList.length; index += 1) {
    const previousPollStartedAtMs = uniquePollStartedAtMsList[index - 1];
    const pollStartedAtMs = uniquePollStartedAtMsList[index];
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
    rejectedIntervalCount: rejectionReasons.gapTooLarge + rejectionReasons.nonPositive,
    averageIntervalMs,
    oldestIncludedPollAtMs,
    newestIncludedPollAtMs,
    rejectionReasons,
  };
}

function calculateAveragePollRateMs(logs, configuredIntervalMs = null, maxIntervals = 100) {
  return calculateAveragePollRateWithDiagnostics(logs, configuredIntervalMs, maxIntervals)
    .averageIntervalMs;
}

function formatAveragePollRate(ms) {
  if (ms === null) {
    return "—";
  }

  if (ms < 60_000) {
    const seconds = ms / 1000;
    if (seconds < 10) {
      const roundedTenths = Math.round(seconds * 10) / 10;
      const label = Number.isInteger(roundedTenths)
        ? String(roundedTenths)
        : roundedTenths.toFixed(1);
      return `${label}s`;
    }

    return `${Math.round(seconds)}s`;
  }

  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (seconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}

function scheduledPoll(startedAtMs, runType = "automatic", eventType = "scrape.completed") {
  const startedAt = new Date(startedAtMs).toISOString();
  const completedAt = new Date(startedAtMs + 500).toISOString();
  return {
    event_type: eventType,
    created_at: completedAt,
    metadata: {
      runType,
      startedAt,
      durationMs: 500,
    },
  };
}

test("health module mirrors average poll rate calculation contract", () => {
  const health = read("src/lib/data-engines/health.ts");
  assert.match(health, /scrape\.failed/);
  assert.match(health, /runType === "run_once"/);
  assert.match(health, /AVERAGE_POLL_RATE_MAX_INTERVALS = 100/);
  assert.match(health, /calculateAveragePollRateWithDiagnostics/);
  assert.doesNotMatch(health, /recentSnapshots/);
});

test("polls every 2.5 seconds display approximately 2.5s", () => {
  const base = Date.parse("2026-01-01T10:00:00.000Z");
  const logs = Array.from({ length: 6 }, (_, index) =>
    scheduledPoll(base + index * 2500),
  );
  const averageMs = calculateAveragePollRateMs(logs, 2500);
  assert.ok(averageMs !== null);
  assert.ok(Math.abs(averageMs - 2500) < 50);
  assert.equal(formatAveragePollRate(averageMs), "2.5s");
});

test("polls every 5 seconds display 5s", () => {
  const base = Date.parse("2026-01-01T10:00:00.000Z");
  const logs = Array.from({ length: 6 }, (_, index) =>
    scheduledPoll(base + index * 5000),
  );
  const averageMs = calculateAveragePollRateMs(logs, 5000);
  assert.equal(formatAveragePollRate(averageMs), "5s");
});

test("polls every 60 seconds display 1m", () => {
  const base = Date.parse("2026-01-01T10:00:00.000Z");
  const logs = Array.from({ length: 4 }, (_, index) =>
    scheduledPoll(base + index * 60_000),
  );
  const averageMs = calculateAveragePollRateMs(logs, 60_000);
  assert.equal(formatAveragePollRate(averageMs), "1m");
});

test("app-closed gap of 53 minutes is excluded", () => {
  const base = Date.parse("2026-01-01T10:00:00.000Z");
  const logs = [
    scheduledPoll(base),
    scheduledPoll(base + 2500),
    scheduledPoll(base + 2500 + 53 * 60 * 1000),
    scheduledPoll(base + 2500 + 53 * 60 * 1000 + 2500),
  ];
  const diagnostics = calculateAveragePollRateWithDiagnostics(logs, 2500);
  assert.equal(diagnostics.rejectionReasons.gapTooLarge, 1);
  assert.equal(diagnostics.acceptedIntervalCount, 2);
  assert.ok(Math.abs(diagnostics.averageIntervalMs - 2500) < 50);
});

test("engine stopped gap is excluded", () => {
  const base = Date.parse("2026-01-01T10:00:00.000Z");
  const logs = [
    scheduledPoll(base),
    scheduledPoll(base + 5000),
    scheduledPoll(base + 5 * 60 * 1000),
    scheduledPoll(base + 5 * 60 * 1000 + 5000),
  ];
  const diagnostics = calculateAveragePollRateWithDiagnostics(logs, 5000);
  assert.equal(diagnostics.rejectionReasons.gapTooLarge, 1);
  assert.equal(diagnostics.averageIntervalMs, 5000);
});

test("new engine session does not create interval from prior session", () => {
  const base = Date.parse("2026-01-01T10:00:00.000Z");
  const logs = [
    scheduledPoll(base),
    scheduledPoll(base + 10_000),
    scheduledPoll(base + 10 * 60 * 1000),
    scheduledPoll(base + 10 * 60 * 1000 + 10_000),
  ];
  const diagnostics = calculateAveragePollRateWithDiagnostics(logs, 10_000);
  assert.equal(diagnostics.rejectionReasons.gapTooLarge, 1);
  assert.equal(diagnostics.acceptedIntervalCount, 2);
});

test("manual Run Once polls do not distort scheduled average", () => {
  const base = Date.parse("2026-01-01T10:00:00.000Z");
  const logs = [
    scheduledPoll(base),
    scheduledPoll(base + 5000),
    scheduledPoll(base + 7500, "run_once"),
    scheduledPoll(base + 10_000),
    scheduledPoll(base + 15_000),
  ];
  const averageMs = calculateAveragePollRateMs(logs, 5000);
  assert.equal(averageMs, 5000);
});

test("failed scheduled poll attempts count as genuine executions", () => {
  const base = Date.parse("2026-01-01T10:00:00.000Z");
  const logs = [
    scheduledPoll(base, "automatic", "scrape.completed"),
    scheduledPoll(base + 5000, "automatic", "scrape.failed"),
    scheduledPoll(base + 10_000, "automatic", "scrape.completed"),
  ];
  const averageMs = calculateAveragePollRateMs(logs, 5000);
  assert.equal(averageMs, 5000);
});

test("non-poll Activity records are excluded", () => {
  const base = Date.parse("2026-01-01T10:00:00.000Z");
  const logs = [
    scheduledPoll(base),
    {
      event_type: "engine.started",
      created_at: new Date(base + 30_000).toISOString(),
      metadata: { runType: "automatic" },
    },
    scheduledPoll(base + 5000),
    scheduledPoll(base + 10_000),
  ];
  const averageMs = calculateAveragePollRateMs(logs, 5000);
  assert.equal(averageMs, 5000);
});

test("millisecond and timestamp normalization is correct", () => {
  const startedAtMs = Date.parse("2026-01-01T10:00:00.000Z");
  const logs = [
    {
      event_type: "scrape.completed",
      created_at: new Date(startedAtMs + 1200).toISOString(),
      metadata: {
        runType: "automatic",
        startedAt: new Date(startedAtMs).toISOString(),
        durationMs: 1200,
      },
    },
    {
      event_type: "scrape.completed",
      created_at: new Date(startedAtMs + 6200).toISOString(),
      metadata: {
        runType: "automatic",
        startedAt: new Date(startedAtMs + 5000).toISOString(),
        durationMs: 1200,
      },
    },
  ];
  const averageMs = calculateAveragePollRateMs(logs, 5000);
  assert.equal(averageMs, 5000);
});

test("recent sample is limited to the intended maximum", () => {
  const base = Date.parse("2026-01-01T10:00:00.000Z");
  const logs = Array.from({ length: 150 }, (_, index) =>
    scheduledPoll(base + index * 2500),
  );
  const diagnostics = calculateAveragePollRateWithDiagnostics(logs, 2500, 100);
  assert.equal(diagnostics.acceptedIntervalCount, 100);
});

test("polling-rate change gradually updates actual average", () => {
  const base = Date.parse("2026-01-01T10:00:00.000Z");
  const slowLogs = Array.from({ length: 10 }, (_, index) =>
    scheduledPoll(base + index * 60_000),
  );
  const slowAverage = calculateAveragePollRateMs(slowLogs, 60_000);
  assert.equal(slowAverage, 60_000);

  const mixedLogs = [
    ...slowLogs,
    scheduledPoll(base + 9 * 60_000 + 2500),
    scheduledPoll(base + 9 * 60_000 + 5000),
    scheduledPoll(base + 9 * 60_000 + 7500),
  ];
  const mixedAverageWithOldConfig = calculateAveragePollRateMs(mixedLogs, 60_000);
  assert.ok(mixedAverageWithOldConfig !== null);
  assert.ok(mixedAverageWithOldConfig < 60_000);
  assert.ok(mixedAverageWithOldConfig > 2500);

  const mixedAverageWithNewConfig = calculateAveragePollRateMs(mixedLogs, 2500);
  assert.equal(mixedAverageWithNewConfig, 2500);
});

test("single poll displays unavailable rather than false average", () => {
  const logs = [scheduledPoll(Date.parse("2026-01-01T10:00:00.000Z"))];
  assert.equal(calculateAveragePollRateMs(logs, 2500), null);
  assert.equal(formatAveragePollRate(null), "—");
});

test("no qualifying intervals display dash", () => {
  const base = Date.parse("2026-01-01T10:00:00.000Z");
  const logs = [
    scheduledPoll(base),
    scheduledPoll(base + 60 * 60 * 1000),
  ];
  const diagnostics = calculateAveragePollRateWithDiagnostics(logs, 2500);
  assert.equal(diagnostics.averageIntervalMs, null);
  assert.equal(formatAveragePollRate(diagnostics.averageIntervalMs), "—");
});

test("duration formatting supports 2.5s", () => {
  assert.equal(formatAveragePollRate(2500), "2.5s");
  assert.equal(formatAveragePollRate(45_000), "45s");
  assert.equal(formatAveragePollRate(65_000), "1m 5s");
});

test("engine statistics passes configured interval into average poll rate", () => {
  const stats = read("src/components/data-engines/webpage-scraper/EngineStatistics.tsx");
  assert.match(stats, /calculateAveragePollRateMs\(logs, pollIntervalMs\)/);
});

test("format module uses dash for unavailable average poll rate", () => {
  const format = read("src/lib/data-engines/format.ts");
  assert.match(format, /return "—"/);
  assert.doesNotMatch(format, /Calculating/);
});
