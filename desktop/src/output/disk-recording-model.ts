/**
 * Record-to-Disk destination model for the Output Engine.
 * Configuration lives in output_routes.configuration_json.recording.
 */

import fs from "node:fs";
import path from "node:path";

export type DiskRecordingFormatId =
  | "prores-4444-mov"
  | "prores-422hq-mov"
  | "h264-mp4";

export type DiskRecordingAlphaMode = "preserve" | "flatten";

export type DiskRecordingLifecycle =
  | "idle"
  | "starting"
  | "recording"
  | "finalizing"
  | "error";

export type DiskRecordingFrameRateId =
  | "23.976"
  | "24"
  | "25"
  | "29.97"
  | "30"
  | "50"
  | "59.94"
  | "60";

export type DiskRecordingConfiguration = {
  format: DiskRecordingFormatId;
  destinationFolder: string;
  width: number;
  height: number;
  frameRateId: DiskRecordingFrameRateId;
  alphaMode: DiskRecordingAlphaMode;
  /** CSS hex (#RRGGBB) used when alphaMode is flatten. Default black. */
  backgroundColor: string;
};

export type DiskRecordingLiveMetrics = {
  lifecycle: DiskRecordingLifecycle;
  startedAt: string | null;
  durationSeconds: number;
  outputPath: string | null;
  tempPath: string | null;
  /** Observed on-disk size of the active partial/final file (0 when empty or unreadable). */
  byteSize: number;
  /**
   * True when Media Foundation (or the filesystem) has not yet exposed meaningful
   * on-disk growth even though frames are encoding. UI must not invent byte sizes.
   */
  diskBytesPending: boolean;
  droppedFrames: number;
  encodedFrames: number;
  /** Measured encoded frames / duration when recording; null when unavailable. */
  actualFps: number | null;
  /** Approximate write throughput in bytes/sec from file growth; null when unavailable. */
  writeBytesPerSecond: number | null;
  /** Free bytes on the destination volume; null when unsupported. */
  availableDiskBytes: number | null;
  format: DiskRecordingFormatId | null;
  supportsAlpha: boolean;
  lastError: string | null;
};

/** Keep in sync with shared/output/recording-live-stats.ts (UI imports that module). */
export function elapsedRecordingSeconds(
  startedAt: string | null | undefined,
  nowMs: number = Date.now(),
): number {
  if (!startedAt) return 0;
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return 0;
  return Math.max(0, (nowMs - startedMs) / 1000);
}

export function formatRecordingByteSize(byteSize: number): string {
  const bytes = Math.max(0, Math.floor(byteSize));
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
  }
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb >= 10 ? Math.round(gb) : Math.round(gb * 10) / 10} GB`;
}

export function formatRecordingLiveStats(input: {
  startedAt: string | null | undefined;
  durationSeconds?: number | null;
  byteSize?: number | null;
  diskBytesPending?: boolean | null;
  encodedFrames?: number | null;
  droppedFrames?: number | null;
  nowMs?: number;
}): string {
  const duration = Math.floor(
    input.startedAt
      ? elapsedRecordingSeconds(input.startedAt, input.nowMs)
      : Math.max(0, input.durationSeconds ?? 0),
  );
  const bytes = Math.max(0, Math.floor(input.byteSize ?? 0));
  const pending =
    input.diskBytesPending === true || (bytes === 0 && (input.encodedFrames ?? 0) > 0);
  const sizeLabel = bytes > 0
    ? formatRecordingByteSize(bytes)
    : pending
      ? "disk buffered"
      : "0 B";
  const dropped = Math.max(0, Math.floor(input.droppedFrames ?? 0));
  const frames = Math.max(0, Math.floor(input.encodedFrames ?? 0));
  const framePart = frames > 0 ? ` · ${frames} frames` : "";
  return `${duration}s · ${sizeLabel}${framePart} · dropped ${dropped}`;
}

export type DiskRecordingCodecAvailability = {
  format: DiskRecordingFormatId;
  label: string;
  container: "mov" | "mp4";
  supportsAlpha: boolean;
  available: boolean;
  reason: string | null;
  encoder: string;
  licenseNote: string;
};

export const DISK_RECORDING_DEVICE_ID = "disk:local";

export const DISK_RECORDING_FORMATS: Array<{
  id: DiskRecordingFormatId;
  label: string;
  container: "mov" | "mp4";
  supportsAlpha: boolean;
}> = [
  {
    id: "prores-4444-mov",
    label: "ProRes 4444 (MOV) — alpha supported",
    container: "mov",
    supportsAlpha: true,
  },
  {
    id: "prores-422hq-mov",
    label: "ProRes 422 HQ (MOV) — flattened (no alpha)",
    container: "mov",
    supportsAlpha: false,
  },
  {
    id: "h264-mp4",
    label: "H.264 (MP4) — flattened (no alpha)",
    container: "mp4",
    supportsAlpha: false,
  },
];

export const DISK_RECORDING_FRAME_RATES: Array<{
  id: DiskRecordingFrameRateId;
  label: string;
  numerator: number;
  denominator: number;
}> = [
  { id: "23.976", label: "23.976 fps (24000/1001)", numerator: 24000, denominator: 1001 },
  { id: "24", label: "24 fps", numerator: 24, denominator: 1 },
  { id: "25", label: "25 fps", numerator: 25, denominator: 1 },
  { id: "29.97", label: "29.97 fps (30000/1001)", numerator: 30000, denominator: 1001 },
  { id: "30", label: "30 fps", numerator: 30, denominator: 1 },
  { id: "50", label: "50 fps", numerator: 50, denominator: 1 },
  { id: "59.94", label: "59.94 fps (60000/1001)", numerator: 60000, denominator: 1001 },
  { id: "60", label: "60 fps", numerator: 60, denominator: 1 },
];

export type DiskRecordingResolutionId =
  | "1280x720"
  | "1920x1080"
  | "2560x1440"
  | "3840x2160"
  | "4096x2160";

export const DISK_RECORDING_RESOLUTIONS: Array<{
  id: DiskRecordingResolutionId;
  label: string;
  width: number;
  height: number;
}> = [
  { id: "1280x720", label: "1280 × 720 — HD", width: 1280, height: 720 },
  { id: "1920x1080", label: "1920 × 1080 — Full HD", width: 1920, height: 1080 },
  { id: "2560x1440", label: "2560 × 1440 — QHD", width: 2560, height: 1440 },
  { id: "3840x2160", label: "3840 × 2160 — UHD 4K", width: 3840, height: 2160 },
  { id: "4096x2160", label: "4096 × 2160 — DCI 4K", width: 4096, height: 2160 },
];

export const DEFAULT_DISK_RECORDING_RESOLUTION_ID: DiskRecordingResolutionId = "1920x1080";

/** Match stored dimensions to a preset id, or null when custom. */
export function resolveRecordingResolutionId(
  width: number,
  height: number,
): DiskRecordingResolutionId | null {
  const match = DISK_RECORDING_RESOLUTIONS.find(
    (entry) => entry.width === width && entry.height === height,
  );
  return match?.id ?? null;
}

export function resolutionFromId(id: DiskRecordingResolutionId): {
  width: number;
  height: number;
} {
  const match =
    DISK_RECORDING_RESOLUTIONS.find((entry) => entry.id === id) ??
    DISK_RECORDING_RESOLUTIONS.find((entry) => entry.id === DEFAULT_DISK_RECORDING_RESOLUTION_ID)!;
  return { width: match.width, height: match.height };
}

const RECORD_NAME_PATTERN = /^Record (\d+)$/i;
const OUTPUT_NAME_PATTERN = /^Output (\d+)$/i;

export function formatDefaultRecordName(sequence: number): string {
  return `Record ${Math.max(1, Math.floor(sequence))}`;
}

export function isAutoGeneratedOutputName(name: string): boolean {
  return OUTPUT_NAME_PATTERN.test(name.trim());
}

export function isAutoGeneratedRecordName(name: string): boolean {
  return RECORD_NAME_PATTERN.test(name.trim());
}

/** Next unused Record N within the given project disk Outputs. */
export function nextAvailableRecordName(
  existingNames: Iterable<string>,
  options?: { excludeName?: string },
): string {
  const used = new Set<number>();
  for (const name of existingNames) {
    const trimmed = name.trim();
    if (options?.excludeName && trimmed === options.excludeName.trim()) continue;
    const match = RECORD_NAME_PATTERN.exec(trimmed);
    if (match) used.add(Number.parseInt(match[1]!, 10));
  }
  let sequence = 1;
  while (used.has(sequence)) sequence += 1;
  return formatDefaultRecordName(sequence);
}

export function formatSupportsAlpha(format: DiskRecordingFormatId): boolean {
  return DISK_RECORDING_FORMATS.find((entry) => entry.id === format)?.supportsAlpha === true;
}

export function containerExtension(format: DiskRecordingFormatId): "mov" | "mp4" {
  return DISK_RECORDING_FORMATS.find((entry) => entry.id === format)?.container ?? "mov";
}

export function resolveFrameRate(id: DiskRecordingFrameRateId): {
  numerator: number;
  denominator: number;
  fps: number;
} {
  const match = DISK_RECORDING_FRAME_RATES.find((entry) => entry.id === id) ?? DISK_RECORDING_FRAME_RATES[4]!;
  return {
    numerator: match.numerator,
    denominator: match.denominator,
    fps: match.numerator / match.denominator,
  };
}

export function parseBackgroundColor(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: Number.parseInt(cleaned.slice(0, 2), 16),
    g: Number.parseInt(cleaned.slice(2, 4), 16),
    b: Number.parseInt(cleaned.slice(4, 6), 16),
  };
}

export function defaultDiskRecordingFormatForPlatform(
  platform: NodeJS.Platform = process.platform,
): DiskRecordingFormatId {
  return platform === "win32" ? "h264-mp4" : "prores-4444-mov";
}

export function isDiskRecordingFormatSupportedOnPlatform(
  format: DiskRecordingFormatId,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform === "win32") {
    return format === "h264-mp4";
  }
  return DISK_RECORDING_FORMATS.some((entry) => entry.id === format);
}

export function normalizeDiskRecordingConfiguration(
  input: Partial<DiskRecordingConfiguration> | null | undefined,
  platform: NodeJS.Platform = process.platform,
): DiskRecordingConfiguration {
  const requested =
    input?.format && DISK_RECORDING_FORMATS.some((entry) => entry.id === input.format)
      ? input.format
      : defaultDiskRecordingFormatForPlatform(platform);
  const format = isDiskRecordingFormatSupportedOnPlatform(requested, platform)
    ? requested
    : defaultDiskRecordingFormatForPlatform(platform);
  const frameRateId =
    input?.frameRateId && DISK_RECORDING_FRAME_RATES.some((entry) => entry.id === input.frameRateId)
      ? input.frameRateId
      : "29.97";
  const supportsAlpha = formatSupportsAlpha(format);
  const alphaMode: DiskRecordingAlphaMode =
    supportsAlpha && input?.alphaMode === "preserve" ? "preserve" : "flatten";
  return {
    format,
    destinationFolder:
      typeof input?.destinationFolder === "string" ? input.destinationFolder.trim() : "",
    width: Math.max(16, Math.min(7680, Math.floor(input?.width ?? 1920))),
    height: Math.max(16, Math.min(4320, Math.floor(input?.height ?? 1080))),
    frameRateId,
    alphaMode: supportsAlpha ? alphaMode : "flatten",
    backgroundColor:
      typeof input?.backgroundColor === "string" && /^#?[0-9a-fA-F]{6}$/.test(input.backgroundColor.trim())
        ? input.backgroundColor.trim().startsWith("#")
          ? input.backgroundColor.trim()
          : `#${input.backgroundColor.trim()}`
        : "#000000",
  };
}

/** Collision-safe final basename: NEUD_{Project}_{Output}_{YYYY-MM-DD_HH-mm-ss}.{ext} */
export function buildRecordingBasename(input: {
  projectName: string;
  outputName: string;
  format: DiskRecordingFormatId;
  at?: Date;
}): string {
  const stamp = formatTimestampForFilename(input.at ?? new Date());
  const project = sanitizeFilenamePart(input.projectName) || "Project";
  const output = sanitizeFilenamePart(input.outputName) || "Record";
  const ext = containerExtension(input.format);
  return `NEUD_${project}_${output}_${stamp}.${ext}`;
}

export function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function formatTimestampForFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export function resolveUniqueRecordingPath(folder: string, basename: string): string {
  let candidate = path.join(folder, basename);
  if (!fs.existsSync(candidate)) return candidate;
  const ext = path.extname(basename);
  const stem = basename.slice(0, basename.length - ext.length);
  for (let i = 2; i < 1000; i += 1) {
    candidate = path.join(folder, `${stem}_${i}${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(folder, `${stem}_${Date.now()}${ext}`);
}

/**
 * In-progress recording path. Media Foundation selects the muxer from the
 * file extension (.mp4 / .asf / .3gp), so the partial file must keep a
 * recognized container suffix — not `something.mp4.neud-partial`.
 */
export function buildPartialRecordingPath(finalPath: string): string {
  const ext = path.extname(finalPath);
  const stem = finalPath.slice(0, finalPath.length - ext.length);
  const containerExt = ext || ".mp4";
  return `${stem}.neud-partial${containerExt}`;
}
