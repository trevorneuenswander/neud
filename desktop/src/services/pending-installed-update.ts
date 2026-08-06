import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { AppPaths } from "./app-paths";

export const PENDING_INSTALLED_UPDATE_FILE = "pending-installed-update.json";
export const PENDING_UPDATE_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingInstalledUpdateMarker = {
  operationId: string;
  sourceVersion: string;
  targetVersion: string;
  requestedAt: string;
  updateSource: "github";
  logoutRequired: true;
};

export function pendingInstalledUpdatePath(paths: AppPaths): string {
  return path.join(paths.root, "updates", PENDING_INSTALLED_UPDATE_FILE);
}

function updatesDir(paths: AppPaths): string {
  return path.join(paths.root, "updates");
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

export function normalizeReleaseVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

export function releaseVersionsEqual(left: string, right: string): boolean {
  return normalizeReleaseVersion(left) === normalizeReleaseVersion(right);
}

export function readPendingInstalledUpdateMarker(
  paths: AppPaths,
): PendingInstalledUpdateMarker | null {
  const filePath = pendingInstalledUpdatePath(paths);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<
      PendingInstalledUpdateMarker
    >;
    if (
      typeof parsed.operationId !== "string" ||
      typeof parsed.sourceVersion !== "string" ||
      typeof parsed.targetVersion !== "string" ||
      typeof parsed.requestedAt !== "string" ||
      parsed.logoutRequired !== true
    ) {
      return null;
    }
    return {
      operationId: parsed.operationId,
      sourceVersion: normalizeReleaseVersion(parsed.sourceVersion),
      targetVersion: normalizeReleaseVersion(parsed.targetVersion),
      requestedAt: parsed.requestedAt,
      updateSource: "github",
      logoutRequired: true,
    };
  } catch {
    return null;
  }
}

export function writePendingInstalledUpdateMarker(
  paths: AppPaths,
  input: {
    sourceVersion: string;
    targetVersion: string;
  },
): PendingInstalledUpdateMarker {
  const marker: PendingInstalledUpdateMarker = {
    operationId: randomUUID(),
    sourceVersion: normalizeReleaseVersion(input.sourceVersion),
    targetVersion: normalizeReleaseVersion(input.targetVersion),
    requestedAt: new Date().toISOString(),
    updateSource: "github",
    logoutRequired: true,
  };
  writeJsonAtomic(pendingInstalledUpdatePath(paths), marker);
  return marker;
}

export function consumePendingInstalledUpdateMarker(paths: AppPaths): boolean {
  const filePath = pendingInstalledUpdatePath(paths);
  if (!fs.existsSync(filePath)) {
    return false;
  }

  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export function isPendingInstalledUpdateMarkerStale(
  marker: PendingInstalledUpdateMarker,
  nowMs = Date.now(),
): boolean {
  const requestedAtMs = Date.parse(marker.requestedAt);
  if (!Number.isFinite(requestedAtMs)) {
    return true;
  }
  return nowMs - requestedAtMs > PENDING_UPDATE_STALE_MS;
}

export function clearPendingInstalledUpdateMarker(paths: AppPaths): void {
  const filePath = pendingInstalledUpdatePath(paths);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function ensureUpdatesDirectory(paths: AppPaths): void {
  fs.mkdirSync(updatesDir(paths), { recursive: true });
}
