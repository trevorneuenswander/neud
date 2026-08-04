import fs from "fs";
import path from "path";
import {
  DOWNLOAD_COMPLETE_MARKER,
  resolveAuctionJsonPathInPackage,
} from "./auction-data-paths";

const SIZE_UNITS = ["B", "KB", "MB", "GB"] as const;

export function formatDownloadSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${SIZE_UNITS[unitIndex]}`;
}

function shouldIncludeInDownloadSize(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  const baseName = path.posix.basename(normalized);
  if (baseName === DOWNLOAD_COMPLETE_MARKER) {
    return true;
  }
  if (normalized.endsWith(".json") || normalized.includes("/photos/") || normalized.startsWith("photos/")) {
    return true;
  }
  if (normalized.endsWith(".json.tmp")) {
    return false;
  }
  return false;
}

export function calculateDirectorySizeBytes(rootDir: string): number {
  if (!fs.existsSync(rootDir)) return 0;

  let total = 0;
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      const relative = path.relative(rootDir, absolutePath);
      if (!shouldIncludeInDownloadSize(relative)) {
        continue;
      }
      total += fs.statSync(absolutePath).size;
    }
  }

  return total;
}

export function calculateDownloadPackageSizeBytes(packageDir: string): number {
  const jsonPath = resolveAuctionJsonPathInPackage(packageDir);
  if (!jsonPath) {
    return 0;
  }
  return calculateDirectorySizeBytes(packageDir);
}
