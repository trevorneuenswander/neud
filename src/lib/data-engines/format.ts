import {
  ENGINE_ACTUAL_STATE_LABELS,
  ENGINE_HEALTH_STATE_LABELS,
  ENGINE_TYPE_LABELS,
  type EngineActualState,
  type EngineHealthState,
  type EngineType,
} from "@/lib/data-engines/constants";

export function formatEngineType(engineType: EngineType): string {
  return ENGINE_TYPE_LABELS[engineType] ?? engineType;
}

export function formatActualState(state: EngineActualState): string {
  return ENGINE_ACTUAL_STATE_LABELS[state] ?? state;
}

export function formatHealthState(state: EngineHealthState): string {
  return ENGINE_HEALTH_STATE_LABELS[state] ?? state;
}

export function formatTimeAgo(value: string | null, nowMs = Date.now()): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - date.getTime()) / 1000));
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds} second${elapsedSeconds === 1 ? "" : "s"} ago`;
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} minute${elapsedMinutes === 1 ? "" : "s"} ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours} hour${elapsedHours === 1 ? "" : "s"} ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
}

export function formatRelativeTime(value: string | null): string {
  return formatTimeAgo(value);
}

export function formatAbsoluteDateTime(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

function formatSubMinuteSecondsLabel(totalSeconds: number): string {
  if (totalSeconds === 1) {
    return "1 second";
  }

  const label = Number.isInteger(totalSeconds)
    ? String(totalSeconds)
    : String(totalSeconds);
  return `${label} seconds`;
}

export function formatPollInterval(ms: number | null): string {
  if (ms === null) return "—";

  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return formatSubMinuteSecondsLabel(totalSeconds);
  }

  const wholeMinutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds - wholeMinutes * 60);
  const minutes = wholeMinutes;

  if (seconds === 0) {
    if (minutes === 60) {
      return "1 hour";
    }
    return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  }

  const minuteLabel = minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const secondLabel = seconds === 1 ? "1 second" : `${seconds} seconds`;
  return `${minuteLabel} ${secondLabel}`;
}

/** Alias for activity and settings copy. */
export const formatPollingInterval = formatPollInterval;

export function formatAveragePollRate(ms: number | null): string {
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

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDurationMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
