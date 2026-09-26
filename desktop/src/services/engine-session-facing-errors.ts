import type { LocalSourceStatus } from "../repositories/data-sources-repository";

const STALE_TRANSIENT_ERROR_PATTERNS = [
  /require is not defined/i,
  /internet disconnected/i,
];

export function isStalePackagedBrowserErrorForPlatform(
  message: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }
  if (platform === "darwin" && /chrome-win64[\\/]chrome\.exe/i.test(trimmed)) {
    return true;
  }
  if (platform === "win32" && /chrome-mac-arm64/i.test(trimmed)) {
    return true;
  }
  return false;
}

export function isStaleTransientEngineError(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }
  return STALE_TRANSIENT_ERROR_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isEngineActivelyFailing(status: LocalSourceStatus | null): boolean {
  if (!status) {
    return false;
  }
  const actualState = status.actualState ?? "stopped";
  if (actualState === "error") {
    return true;
  }
  if (actualState === "running" && status.healthState === "error") {
    return true;
  }
  if (actualState === "starting" && status.healthState === "error") {
    return true;
  }
  return false;
}

/** Active engine status error shown under Engine State (not execution log history). */
export function resolveSessionFacingEngineLastError(
  status: LocalSourceStatus | null,
): string | null {
  const message = status?.lastError?.trim() ?? "";
  if (!message) {
    return null;
  }
  if (isEngineActivelyFailing(status)) {
    return message;
  }
  if (isStaleTransientEngineError(message)) {
    return null;
  }
  if (isStalePackagedBrowserErrorForPlatform(message)) {
    return null;
  }
  const actualState = status?.actualState ?? "stopped";
  if (
    actualState === "stopped" ||
    actualState === "offline" ||
    actualState === "stopping"
  ) {
    return null;
  }
  return message;
}

export function shouldClearPersistedEngineLastError(
  status: LocalSourceStatus | null,
): boolean {
  const message = status?.lastError?.trim() ?? "";
  if (!message) {
    return false;
  }
  if (isEngineActivelyFailing(status)) {
    return false;
  }
  return isStaleTransientEngineError(message);
}
