import fs from "node:fs";
import path from "node:path";
import {
  buildRecordingBasename,
  DISK_RECORDING_DEVICE_ID,
  formatSupportsAlpha,
  normalizeDiskRecordingConfiguration,
  parseBackgroundColor,
  resolveFrameRate,
  resolveUniqueRecordingPath,
  type DiskRecordingConfiguration,
  type DiskRecordingLiveMetrics,
  type DiskRecordingLifecycle,
} from "./disk-recording-model";
import {
  listDiskRecordingCodecAvailability,
  loadNativeDiskRecorderAddon,
  userFacingDiskRecorderUnavailableMessage,
  type NativeDiskRecorderAddon,
} from "./native-disk-recorder";
import type { OffscreenOutputRenderer } from "./offscreen-output-renderer";

export type DiskRecordingStartInput = {
  routeId: string;
  projectId: string;
  projectName: string;
  outputName: string;
  renderUrl: string;
  configuration: DiskRecordingConfiguration;
};

type ActiveRecording = {
  routeId: string;
  sessionId: string;
  lifecycle: DiskRecordingLifecycle;
  startedAt: string | null;
  startedMs: number;
  outputPath: string;
  tempPath: string;
  configuration: DiskRecordingConfiguration;
  encodedFrames: number;
  droppedFrames: number;
  lastError: string | null;
  frameIndex: number;
  lastByteSample: { atMs: number; bytes: number } | null;
};

/**
 * Record-to-Disk pipeline: OffscreenOutputRenderer BGRA → native encoder.
 * Shares the same composed-frame capture path used by DeckLink.
 */
export class DiskRecordingService {
  private readonly sessions = new Map<string, ActiveRecording>();
  private readonly addon: NativeDiskRecorderAddon | null;
  private onChange: (() => void) | null = null;

  constructor(private readonly renderer: OffscreenOutputRenderer) {
    this.addon = loadNativeDiskRecorderAddon();
  }

  setOnChange(listener: (() => void) | null): void {
    this.onChange = listener;
  }

  platform() {
    return this.addon?.platform() ?? { encoder: "unavailable", available: false };
  }

  codecs() {
    return listDiskRecordingCodecAvailability().map((codec) => ({
      ...codec,
      container:
        codec.format === "h264-mp4" ? ("mp4" as const) : ("mov" as const),
    }));
  }

  isDiskDevice(deviceId: string): boolean {
    return deviceId === DISK_RECORDING_DEVICE_ID || deviceId.startsWith("disk:");
  }

  getMetrics(routeId: string): DiskRecordingLiveMetrics | null {
    const session = this.sessions.get(routeId);
    if (!session) return null;
    let byteSize = 0;
    try {
      const probe = fs.existsSync(session.tempPath)
        ? session.tempPath
        : session.outputPath;
      if (fs.existsSync(probe)) byteSize = fs.statSync(probe).size;
    } catch {
      byteSize = 0;
    }
    const durationSeconds =
      session.startedMs > 0 ? Math.max(0, (Date.now() - session.startedMs) / 1000) : 0;
    const actualFps =
      session.lifecycle === "recording" && durationSeconds > 0.5 && session.encodedFrames > 0
        ? Math.round((session.encodedFrames / durationSeconds) * 10) / 10
        : null;
    let writeBytesPerSecond: number | null = null;
    const nowMs = Date.now();
    if (session.lastByteSample && nowMs > session.lastByteSample.atMs) {
      const elapsed = (nowMs - session.lastByteSample.atMs) / 1000;
      if (elapsed >= 0.5) {
        const delta = Math.max(0, byteSize - session.lastByteSample.bytes);
        writeBytesPerSecond = Math.round(delta / elapsed);
        session.lastByteSample = { atMs: nowMs, bytes: byteSize };
      }
    } else {
      session.lastByteSample = { atMs: nowMs, bytes: byteSize };
    }
    return {
      lifecycle: session.lifecycle,
      startedAt: session.startedAt,
      durationSeconds,
      outputPath: session.lifecycle === "recording" ? session.tempPath : session.outputPath,
      tempPath: session.tempPath,
      byteSize,
      droppedFrames: session.droppedFrames,
      encodedFrames: session.encodedFrames,
      actualFps,
      writeBytesPerSecond,
      availableDiskBytes: readAvailableDiskBytes(session.configuration.destinationFolder),
      format: session.configuration.format,
      supportsAlpha: formatSupportsAlpha(session.configuration.format),
      lastError: session.lastError,
    };
  }

  async start(input: DiskRecordingStartInput): Promise<
    | { ok: true; metrics: DiskRecordingLiveMetrics }
    | { ok: false; error: string; code: string }
  > {
    if (!this.addon) {
      return {
        ok: false,
        code: "encoder-unavailable",
        error: userFacingDiskRecorderUnavailableMessage(),
      };
    }
    const config = normalizeDiskRecordingConfiguration(input.configuration);
    const codecs = this.codecs();
    const codec = codecs.find((entry) => entry.format === config.format);
    if (!codec?.available) {
      return {
        ok: false,
        code: "codec-unavailable",
        error: codec?.reason || `Format ${config.format} is unavailable on this platform.`,
      };
    }
    if (!config.destinationFolder) {
      return { ok: false, code: "folder-required", error: "Choose a destination folder." };
    }
    const folderCheck = validateDestinationFolder(config.destinationFolder);
    if (!folderCheck.ok) {
      return { ok: false, code: folderCheck.code, error: folderCheck.error };
    }

    const basename = buildRecordingBasename({
      projectName: input.projectName,
      outputName: input.outputName,
      format: config.format,
    });
    const finalPath = resolveUniqueRecordingPath(config.destinationFolder, basename);
    const tempPath = `${finalPath}.neud-partial`;
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // best effort
    }

    const rate = resolveFrameRate(config.frameRateId);
    const bg = parseBackgroundColor(config.backgroundColor);
    const preserveAlpha =
      config.alphaMode === "preserve" && formatSupportsAlpha(config.format);

    this.sessions.set(input.routeId, {
      routeId: input.routeId,
      sessionId: "",
      lifecycle: "starting",
      startedAt: null,
      startedMs: 0,
      outputPath: finalPath,
      tempPath,
      configuration: config,
      encodedFrames: 0,
      droppedFrames: 0,
      lastError: null,
      frameIndex: 0,
      lastByteSample: null,
    });
    this.emitChange();

    const openedRenderer = await this.renderer.open({
      routeId: input.routeId,
      url: input.renderUrl,
      width: config.width,
      height: config.height,
    });
    if (!openedRenderer.ok) {
      this.sessions.delete(input.routeId);
      this.emitChange();
      return {
        ok: false,
        code: "renderer-failed",
        error: openedRenderer.error || "Unable to open recording compositor.",
      };
    }

    const opened = this.addon.open({
      filePath: tempPath,
      width: config.width,
      height: config.height,
      format: config.format,
      fpsNumerator: rate.numerator,
      fpsDenominator: rate.denominator,
      preserveAlpha,
      backgroundR: bg.r,
      backgroundG: bg.g,
      backgroundB: bg.b,
    });
    if (!opened.ok) {
      this.renderer.close(input.routeId);
      this.sessions.delete(input.routeId);
      this.emitChange();
      return { ok: false, code: "encoder-open-failed", error: opened.error };
    }

    const startedAt = new Date().toISOString();
    const active = this.sessions.get(input.routeId)!;
    active.sessionId = opened.sessionId;
    active.lifecycle = "recording";
    active.startedAt = startedAt;
    active.startedMs = Date.now();

    this.renderer.onFrame(input.routeId, (frame) => {
      const current = this.sessions.get(input.routeId);
      if (!current || current.lifecycle !== "recording" || !this.addon) return;
      current.frameIndex += 1;
      const ptsUs = Math.round(
        (current.frameIndex * rate.denominator * 1_000_000) / rate.numerator,
      );
      try {
        const result = this.addon.appendFrame(current.sessionId, {
          width: frame.width,
          height: frame.height,
          ptsUs,
          bgra: frame.bgra,
        });
        current.encodedFrames = result.encodedFrames;
        current.droppedFrames = result.droppedFrames;
        if (!result.ok) {
          current.droppedFrames += 1;
        }
      } catch {
        current.droppedFrames += 1;
      }
    });

    this.emitChange();
    return { ok: true, metrics: this.getMetrics(input.routeId)! };
  }

  async stop(
    routeId: string,
  ): Promise<{ ok: true; metrics: DiskRecordingLiveMetrics | null } | { ok: false; error: string }> {
    const session = this.sessions.get(routeId);
    if (!session) {
      this.renderer.close(routeId);
      return { ok: true, metrics: null };
    }
    session.lifecycle = "finalizing";
    this.emitChange();
    this.renderer.onFrame(routeId, null);
    this.renderer.close(routeId);

    if (!this.addon || !session.sessionId) {
      this.sessions.delete(routeId);
      this.emitChange();
      return { ok: false, error: "Recorder session missing during finalize." };
    }

    let finalizeResult: { ok: boolean; error?: string; encodedFrames: number; droppedFrames: number };
    try {
      finalizeResult = this.addon.finalize(session.sessionId);
    } catch (error) {
      finalizeResult = {
        ok: false,
        error: error instanceof Error ? error.message : "Finalize failed.",
        encodedFrames: session.encodedFrames,
        droppedFrames: session.droppedFrames,
      };
    }

    session.encodedFrames = finalizeResult.encodedFrames;
    session.droppedFrames = finalizeResult.droppedFrames;

    if (!finalizeResult.ok) {
      session.lifecycle = "error";
      session.lastError = finalizeResult.error ?? "Recording finalization failed.";
      try {
        this.addon.close(session.sessionId);
      } catch {
        // ignore
      }
      this.sessions.delete(routeId);
      this.emitChange();
      return { ok: false, error: session.lastError };
    }

    try {
      if (fs.existsSync(session.outputPath)) {
        fs.unlinkSync(session.outputPath);
      }
      fs.renameSync(session.tempPath, session.outputPath);
    } catch (error) {
      session.lifecycle = "error";
      session.lastError =
        error instanceof Error ? error.message : "Unable to promote recording file.";
      this.sessions.delete(routeId);
      this.emitChange();
      return { ok: false, error: session.lastError };
    }

    this.sessions.delete(routeId);
    this.emitChange();
    const durationSeconds = session.startedMs
      ? Math.max(0, (Date.now() - session.startedMs) / 1000)
      : 0;
    return {
      ok: true,
      metrics: {
        lifecycle: "idle",
        startedAt: session.startedAt,
        durationSeconds,
        outputPath: session.outputPath,
        tempPath: null,
        byteSize: fs.existsSync(session.outputPath) ? fs.statSync(session.outputPath).size : 0,
        droppedFrames: session.droppedFrames,
        encodedFrames: session.encodedFrames,
        actualFps:
          durationSeconds > 0.5 && session.encodedFrames > 0
            ? Math.round((session.encodedFrames / durationSeconds) * 10) / 10
            : null,
        writeBytesPerSecond: null,
        availableDiskBytes: readAvailableDiskBytes(session.configuration.destinationFolder),
        format: session.configuration.format,
        supportsAlpha: formatSupportsAlpha(session.configuration.format),
        lastError: null,
      },
    };
  }

  stopAll(): void {
    for (const routeId of [...this.sessions.keys()]) {
      void this.stop(routeId);
    }
  }

  private emitChange(): void {
    try {
      this.onChange?.();
    } catch {
      // ignore listener errors
    }
  }
}

export function readAvailableDiskBytes(folder: string): number | null {
  if (!folder.trim()) return null;
  try {
    const resolved = path.resolve(folder);
    const free = (
      fs as typeof fs & { statfsSync?: (p: string) => { bavail: number; bsize: number } }
    ).statfsSync?.(resolved);
    if (!free) return null;
    return free.bavail * free.bsize;
  } catch {
    return null;
  }
}

export function validateDestinationFolder(
  folder: string,
): { ok: true } | { ok: false; code: string; error: string } {
  const resolved = path.resolve(folder);
  if (!resolved || resolved.includes("\0")) {
    return { ok: false, code: "invalid-folder", error: "Destination folder is invalid." };
  }
  try {
    if (!fs.existsSync(resolved)) {
      return { ok: false, code: "folder-missing", error: "Destination folder does not exist." };
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return { ok: false, code: "not-a-folder", error: "Destination path is not a folder." };
    }
    fs.accessSync(resolved, fs.constants.W_OK);
  } catch {
    return {
      ok: false,
      code: "folder-unwritable",
      error: "Destination folder is not writable.",
    };
  }
  // Basic free-space check (warn under 100 MB).
  try {
    const free = (fs as typeof fs & { statfsSync?: (p: string) => { bavail: number; bsize: number } })
      .statfsSync?.(resolved);
    if (free && free.bavail * free.bsize < 100 * 1024 * 1024) {
      return {
        ok: false,
        code: "disk-space",
        error: "Destination volume has less than 100 MB free.",
      };
    }
  } catch {
    // Platform may not support statfsSync — skip.
  }
  return { ok: true };
}
