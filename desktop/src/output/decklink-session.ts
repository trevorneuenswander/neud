import {
  DECKLINK_PREROLL_FRAMES,
  formatDisplayOnlyFps,
  type DeckLinkLiveMetrics,
} from "./decklink-model.ts";

export type DeckLinkFrameResult = "completed" | "displayed-late" | "dropped" | "flushed";

export class DeckLinkFillSession {
  state: "idle" | "waiting-frame" | "preroll" | "playing" | "stopping" | "stopped" | "lost" = "idle";
  latestRevision: number | null = null;
  scheduledFrames = 0;
  completedFrames = 0;
  droppedFrames = 0;
  lateFrames = 0;
  underruns = 0;
  reusedFrames = 0;
  queueDepth = 0;
  lastFrameCompletionAt: string | null = null;
  lastScheduledRevision: number | null = null;
  playbackStarted = false;
  outputEnabled = false;
  outputDisabled = false;
  nativeError: string | null = null;
  streamTime = 0;
  readonly frameDuration: number;
  readonly timeScale: number;

  constructor(frameRateNumerator: number, frameRateDenominator: number) {
    this.timeScale = frameRateNumerator;
    this.frameDuration = frameRateDenominator;
  }

  supplyFrame(revision: number): void {
    this.latestRevision = revision;
  }

  preroll(): { ok: true } | { ok: false; error: string } {
    if (this.latestRevision == null) {
      this.state = "waiting-frame";
      return { ok: false, error: "DeckLink output did not receive a rendered frame" };
    }
    this.state = "preroll";
    this.outputEnabled = true;
    for (let index = 0; index < DECKLINK_PREROLL_FRAMES; index += 1) {
      this.scheduleOne();
    }
    return { ok: true };
  }

  startPlayback(): { ok: true } | { ok: false; error: string } {
    if (this.scheduledFrames < DECKLINK_PREROLL_FRAMES) {
      this.nativeError = "Scheduled playback failed";
      return { ok: false, error: "Scheduled playback failed" };
    }
    this.playbackStarted = true;
    this.state = "playing";
    return { ok: true };
  }

  scheduleOne(): void {
    if (this.latestRevision == null) {
      this.underruns += 1;
      this.nativeError = "Output timing underrun";
      return;
    }
    if (this.lastScheduledRevision === this.latestRevision) this.reusedFrames += 1;
    this.lastScheduledRevision = this.latestRevision;
    this.scheduledFrames += 1;
    this.queueDepth += 1;
    this.streamTime += this.frameDuration;
  }

  complete(result: DeckLinkFrameResult, completedAt: string): void {
    this.lastFrameCompletionAt = completedAt;
    if (this.state === "stopping" || this.state === "stopped" || this.state === "lost") {
      if (result === "flushed") this.queueDepth = Math.max(0, this.queueDepth - 1);
      return;
    }
    this.queueDepth = Math.max(0, this.queueDepth - 1);
    if (result === "dropped") this.droppedFrames += 1;
    else if (result === "displayed-late") {
      this.lateFrames += 1;
      this.completedFrames += 1;
    } else if (result === "completed") {
      this.completedFrames += 1;
    }
    if (this.state === "playing") this.scheduleOne();
  }

  noteUnderrun(): void {
    this.underruns += 1;
    this.nativeError = "Output timing underrun";
  }

  stop(): void {
    this.state = "stopping";
    this.playbackStarted = false;
    this.outputEnabled = false;
    this.outputDisabled = true;
    this.queueDepth = 0;
    this.state = "stopped";
  }

  loseDevice(): void {
    this.stop();
    this.state = "lost";
    this.nativeError = "Device removed";
  }

  metrics(input: {
    sdkVersion: string | null;
    deviceModel?: string | null;
    persistentId?: string | null;
    endpointIndex?: number | null;
    displayModeId: string | null;
    modeName: string | null;
    width: number | null;
    height: number | null;
    fillBackground: string;
    rendererRevision: number;
    rendererRepaints: number;
    rendererPixelOrder?: "bgra" | "rgba" | "unknown" | null;
    rowBytes?: number | null;
    playbackStartedAt?: string | null;
    lastCompletionResult?: string | null;
    startStage?: string | null;
  }): DeckLinkLiveMetrics {
    return {
      sdkVersion: input.sdkVersion,
      pixelFormat: "bgra8",
      deviceModel: input.deviceModel ?? null,
      persistentId: input.persistentId ?? null,
      endpointIndex: input.endpointIndex ?? null,
      displayModeId: input.displayModeId,
      modeName: input.modeName,
      displayModeName: input.modeName,
      frameRateNumerator: this.timeScale,
      frameRateDenominator: this.frameDuration,
      frameDuration: this.frameDuration,
      frameTimescale: this.timeScale,
      computedFpsForDisplayOnly: formatDisplayOnlyFps(this.timeScale, this.frameDuration),
      width: input.width,
      height: input.height,
      rendererWidth: input.width,
      rendererHeight: input.height,
      rowBytes: input.rowBytes ?? (input.width != null ? input.width * 4 : null),
      rendererPixelOrder: input.rendererPixelOrder ?? null,
      fillBackground: input.fillBackground,
      scheduledFrames: this.scheduledFrames,
      completedFrames: this.completedFrames,
      droppedFrames: this.droppedFrames,
      lateFrames: this.lateFrames,
      underruns: this.underruns,
      reusedFrames: this.reusedFrames,
      queueDepth: this.queueDepth,
      lastFrameCompletionAt: this.lastFrameCompletionAt,
      lastCompletionResult: input.lastCompletionResult ?? null,
      lastScheduledRevision: this.lastScheduledRevision,
      rendererRevision: input.rendererRevision,
      rendererRepaints: input.rendererRepaints,
      playbackStartedAt: input.playbackStartedAt ?? null,
      playbackStarted: this.playbackStarted,
      outputEnabled: this.outputEnabled,
      lastError: this.nativeError,
      nativeError: this.nativeError,
      startStage: input.startStage ?? (this.playbackStarted ? "live" : null),
    };
  }
}
