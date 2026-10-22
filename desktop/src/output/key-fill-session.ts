/**
 * Key + Fill logical session architecture (Phase 2B.1 / 2B.2A).
 * One master timeline; Fill and Key share displayTime / duration / timescale.
 * Frame pairs from key-fill-processor attach to scheduled logical frames.
 * No real hardware Key scheduling in this pass.
 */

import type { KeyFillFramePair } from "./key-fill-processor.ts";
import { createKeyFillFramePair, diagnosticsFromPair } from "./key-fill-processor.ts";

export type KeyFillCompletionResult = "completed" | "late" | "dropped" | "flushed" | "unknown";

export type KeyFillLogicalFrame = {
  frameNumber: number;
  displayTime: number;
  displayDuration: number;
  timeScale: number;
  fillScheduled: boolean;
  keyScheduled: boolean;
  fillCompleted: boolean;
  keyCompleted: boolean;
  fillCompletionResult: KeyFillCompletionResult | null;
  keyCompletionResult: KeyFillCompletionResult | null;
  /** Atomic Fill+Key buffers derived from one source paint. */
  pair: KeyFillFramePair | null;
};

export type KeyFillSyncFault = {
  frameNumber: number;
  displayTime: number;
  reason: string;
  at: string;
};

export class KeyFillSession {
  readonly prerollFrames: number;
  readonly frameDuration: number;
  readonly timeScale: number;
  private nextFrameNumber = 0;
  private frames = new Map<number, KeyFillLogicalFrame>();
  private syncFaults: KeyFillSyncFault[] = [];
  private playing = false;
  private startedAt: string | null = null;

  constructor(input: { prerollFrames: number; frameDuration: number; timeScale: number }) {
    this.prerollFrames = Math.max(1, input.prerollFrames);
    this.frameDuration = input.frameDuration;
    this.timeScale = input.timeScale;
  }

  get masterFrame(): number {
    return Math.max(0, this.nextFrameNumber - 1);
  }

  get syncFaultCount(): number {
    return this.syncFaults.length;
  }

  get lastSyncFault(): KeyFillSyncFault | null {
    return this.syncFaults[this.syncFaults.length - 1] ?? null;
  }

  diagnostics() {
    return {
      mode: "keyFill" as const,
      playing: this.playing,
      startedAt: this.startedAt,
      masterFrame: this.masterFrame,
      prerollFrames: this.prerollFrames,
      frameDuration: this.frameDuration,
      timeScale: this.timeScale,
      syncFaults: this.syncFaultCount,
      lastSyncFault: this.lastSyncFault,
      outstanding: [...this.frames.values()].filter((frame) => !frame.fillCompleted || !frame.keyCompleted),
    };
  }

  /** Build synchronized preroll plan — identical timestamps for Fill and Key. */
  planPreroll(): Array<{ frameNumber: number; displayTime: number; displayDuration: number; timeScale: number }> {
    const plan = [];
    for (let index = 0; index < this.prerollFrames; index += 1) {
      plan.push({
        frameNumber: index,
        displayTime: index * this.frameDuration,
        displayDuration: this.frameDuration,
        timeScale: this.timeScale,
      });
    }
    return plan;
  }

  /** Atomic Start from operator perspective: both sides must preroll before playback epoch. */
  beginPlayback(atIso: string): { ok: true } | { ok: false; error: string } {
    for (const planned of this.planPreroll()) {
      const scheduled = this.schedulePairedFrame(planned.frameNumber, planned.displayTime);
      if (!scheduled.ok) return scheduled;
    }
    this.playing = true;
    this.startedAt = atIso;
    return { ok: true };
  }

  schedulePairedFrame(
    frameNumber: number,
    displayTime: number,
    pair?: KeyFillFramePair | null,
  ): { ok: true; frame: KeyFillLogicalFrame } | { ok: false; error: string } {
    if (this.frames.has(frameNumber)) {
      return { ok: false, error: `Frame ${frameNumber} already scheduled` };
    }
    if (pair) {
      if (pair.frameNumber !== frameNumber) {
        return { ok: false, error: "Key + Fill pair frameNumber mismatch" };
      }
      if (pair.displayTime !== displayTime) {
        return { ok: false, error: "Key + Fill pair displayTime mismatch" };
      }
      if (pair.displayDuration !== this.frameDuration || pair.timeScale !== this.timeScale) {
        return { ok: false, error: "Key + Fill pair timing metadata mismatch" };
      }
    }
    const frame: KeyFillLogicalFrame = {
      frameNumber,
      displayTime,
      displayDuration: this.frameDuration,
      timeScale: this.timeScale,
      fillScheduled: true,
      keyScheduled: true,
      fillCompleted: false,
      keyCompleted: false,
      fillCompletionResult: null,
      keyCompletionResult: null,
      pair: pair ?? null,
    };
    this.frames.set(frameNumber, frame);
    this.nextFrameNumber = Math.max(this.nextFrameNumber, frameNumber + 1);
    return { ok: true, frame };
  }

  /**
   * Derive an atomic Fill/Key pair from one source buffer and schedule both sides together.
   * Failures schedule neither plane.
   */
  processAndScheduleSourceFrame(input: {
    sourceBgra: Uint8Array;
    width: number;
    height: number;
    frameNumber: number;
    displayTime: number;
    sourceRevision?: number;
    keyPolarity?: "whiteOnBlack" | "blackOnWhite" | "unknown";
  }): { ok: true; frame: KeyFillLogicalFrame; pair: KeyFillFramePair } | { ok: false; error: string } {
    const created = createKeyFillFramePair(input.sourceBgra, {
      frameNumber: input.frameNumber,
      displayTime: input.displayTime,
      displayDuration: this.frameDuration,
      timeScale: this.timeScale,
      width: input.width,
      height: input.height,
      sourceRevision: input.sourceRevision,
      keyPolarity: input.keyPolarity ?? "whiteOnBlack",
    });
    if (!created.ok) return created;
    const scheduled = this.schedulePairedFrame(input.frameNumber, input.displayTime, created.pair);
    if (!scheduled.ok) return scheduled;
    return { ok: true, frame: scheduled.frame, pair: created.pair };
  }

  lastPairDiagnostics() {
    for (const frame of this.frames.values()) {
      if (frame.pair) return diagnosticsFromPair(frame.pair);
    }
    return null;
  }

  markFillCompleted(frameNumber: number, result: KeyFillCompletionResult): void {
    const frame = this.frames.get(frameNumber);
    if (!frame) return;
    frame.fillCompleted = true;
    frame.fillCompletionResult = result;
    this.evaluateSync(frame);
  }

  markKeyCompleted(frameNumber: number, result: KeyFillCompletionResult): void {
    const frame = this.frames.get(frameNumber);
    if (!frame) return;
    frame.keyCompleted = true;
    frame.keyCompletionResult = result;
    this.evaluateSync(frame);
  }

  private evaluateSync(frame: KeyFillLogicalFrame): void {
    if (!frame.fillCompleted || !frame.keyCompleted) return;
    const fillBad = frame.fillCompletionResult === "late" || frame.fillCompletionResult === "dropped";
    const keyBad = frame.keyCompletionResult === "late" || frame.keyCompletionResult === "dropped";
    if (fillBad || keyBad) {
      this.syncFaults.push({
        frameNumber: frame.frameNumber,
        displayTime: frame.displayTime,
        reason: `Key + Fill sync fault: fill=${frame.fillCompletionResult} key=${frame.keyCompletionResult}`,
        at: new Date().toISOString(),
      });
    }
    this.frames.delete(frame.frameNumber);
  }

  /**
   * Partial Start rollback: if either side fails during enable/preroll, neither remains live.
   */
  static rollbackPartialStart(state: {
    fillEnabled: boolean;
    keyEnabled: boolean;
    fillStop: () => void;
    keyStop: () => void;
  }): { fillStopped: boolean; keyStopped: boolean } {
    let fillStopped = false;
    let keyStopped = false;
    if (state.fillEnabled) {
      state.fillStop();
      fillStopped = true;
    }
    if (state.keyEnabled) {
      state.keyStop();
      keyStopped = true;
    }
    return { fillStopped, keyStopped };
  }

  /**
   * Stop cleans up both sides even if one throws.
   */
  static stopBoth(state: {
    fillStop: () => void;
    keyStop: () => void;
  }): { fillError: string | null; keyError: string | null } {
    let fillError: string | null = null;
    let keyError: string | null = null;
    try {
      state.fillStop();
    } catch (error) {
      fillError = error instanceof Error ? error.message : String(error);
    }
    try {
      state.keyStop();
    } catch (error) {
      keyError = error instanceof Error ? error.message : String(error);
    }
    return { fillError, keyError };
  }
}
