import { BrowserWindow, nativeImage } from "electron";
import { DECKLINK_FIRST_FRAME_TIMEOUT, normalizePaintBufferToBgra } from "./decklink-model.ts";
import type { DeckLinkFrameRenderer } from "./decklink-output-service.ts";
import { attachOutputCleanFeedGuards } from "./output-clean-feed.ts";

export type RendererPixelOrder = "bgra" | "rgba" | "unknown";

type StoredFrame = {
  revision: number;
  repaints: number;
  width: number;
  height: number;
  /** Always normalized to BGRA for DeckLink Fill at the exact target raster. */
  bgra: Buffer;
  sourcePixelOrder: RendererPixelOrder;
};

type PendingPaint = {
  image: Electron.NativeImage;
};

/** 1×1 opaque red PNG used to detect NativeImage channel order. */
const RED_PIXEL_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function detectNativeImagePixelOrder(): RendererPixelOrder {
  try {
    const probe = nativeImage.createFromDataURL(RED_PIXEL_DATA_URL).toBitmap();
    if (probe.length < 4) return "unknown";
    if ((probe[2] ?? 0) > 200 && (probe[0] ?? 0) < 50) return "bgra";
    if ((probe[0] ?? 0) > 200 && (probe[2] ?? 0) < 50) return "rgba";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Ensure the paint buffer matches the DeckLink target raster.
 * Prefer Chromium CSS scaling in window-fit / stack-fit; if Retina/deviceScaleFactor
 * produces a larger bitmap, resize with "good" quality (faster than "best" at 60fps).
 */
export function normalizePaintToTargetRaster(
  image: Electron.NativeImage,
  targetWidth: number,
  targetHeight: number,
): { bitmap: Buffer; width: number; height: number; resized: boolean } {
  const size = image.getSize();
  if (size.width < 1 || size.height < 1) {
    return {
      bitmap: Buffer.alloc(targetWidth * targetHeight * 4),
      width: targetWidth,
      height: targetHeight,
      resized: true,
    };
  }
  if (size.width === targetWidth && size.height === targetHeight) {
    return { bitmap: image.toBitmap(), width: targetWidth, height: targetHeight, resized: false };
  }
  const resized = image.resize({
    width: targetWidth,
    height: targetHeight,
    quality: "good",
  });
  return {
    bitmap: resized.toBitmap(),
    width: targetWidth,
    height: targetHeight,
    resized: true,
  };
}

/**
 * Offscreen DeckLink capture: ONE BrowserWindow → ONE paint stream → coalesced
 * BGRA conversion. Chromium may paint faster than SDI cadence; we keep latest
 * pending image and convert once per tick. Static content stops converting once
 * paints settle; DeckLink reuses the last pushed buffer natively.
 */
export class OffscreenOutputRenderer implements DeckLinkFrameRenderer {
  private readonly windows = new Map<string, BrowserWindow>();
  private readonly frames = new Map<string, StoredFrame>();
  private readonly listeners = new Map<string, (frame: StoredFrame) => void>();
  private readonly pending = new Map<string, PendingPaint>();
  private readonly convertScheduled = new Map<string, boolean>();
  private readonly bgraPools = new Map<string, Buffer>();
  private readonly cleanups = new Map<string, () => void>();
  readonly pixelOrder: RendererPixelOrder = detectNativeImagePixelOrder();

  async open(input: { routeId: string; url: string; width: number; height: number }) {
    this.close(input.routeId);
    const window = new BrowserWindow({
      show: false,
      frame: false,
      transparent: true,
      width: input.width,
      height: input.height,
      useContentSize: true,
      backgroundColor: "#00000000",
      webPreferences: {
        offscreen: true,
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.windows.set(input.routeId, window);
    const detachCleanFeed = attachOutputCleanFeedGuards(window.webContents, {
      label: "decklink-offscreen",
    });
    this.cleanups.set(input.routeId, detachCleanFeed);
    // Paint often enough for 59.94 Fill without driving SDI cadence from JS timers.
    window.webContents.setFrameRate(60);

    const firstPaint = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(DECKLINK_FIRST_FRAME_TIMEOUT)), 8000);
      window.webContents.once("paint", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    window.webContents.on("paint", (_event, _dirty, image) => {
      try {
        if (!image || image.isEmpty()) return;
        // Hold the latest NativeImage only — do not convert on every Chromium paint.
        this.pending.set(input.routeId, { image });
        this.scheduleConvert(input.routeId, input.width, input.height);
      } catch (error) {
        console.error("[decklink-renderer] paint frame failed", error);
      }
    });

    try {
      await window.loadURL(input.url);
      await firstPaint;
      // Ensure the first paint is fully converted before start() reads frame().
      this.flushConvert(input.routeId, input.width, input.height);
    } catch (error) {
      this.close(input.routeId);
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : DECKLINK_FIRST_FRAME_TIMEOUT,
      };
    }
    return { ok: true as const, revision: this.revision(input.routeId) || 1 };
  }

  private scheduleConvert(routeId: string, width: number, height: number): void {
    if (this.convertScheduled.get(routeId)) return;
    this.convertScheduled.set(routeId, true);
    setImmediate(() => {
      this.convertScheduled.set(routeId, false);
      this.flushConvert(routeId, width, height);
    });
  }

  private flushConvert(routeId: string, width: number, height: number): void {
    const pending = this.pending.get(routeId);
    if (!pending) return;
    this.pending.delete(routeId);
    try {
      if (!pending.image || pending.image.isEmpty()) return;
      const current = this.frames.get(routeId);
      const revision = (current?.revision ?? 0) + 1;
      const normalized = normalizePaintToTargetRaster(pending.image, width, height);
      const pool = this.bgraPools.get(routeId);
      const bgra = normalizePaintBufferToBgra(normalized.bitmap, this.pixelOrder, pool);
      this.bgraPools.set(routeId, bgra);
      const stored: StoredFrame = {
        revision,
        repaints: (current?.repaints ?? 0) + 1,
        width: normalized.width,
        height: normalized.height,
        bgra,
        sourcePixelOrder: this.pixelOrder,
      };
      this.frames.set(routeId, stored);
      this.listeners.get(routeId)?.(stored);
    } catch (error) {
      console.error("[decklink-renderer] convert frame failed", error);
    }
  }

  revision(routeId: string): number {
    return this.frames.get(routeId)?.revision ?? 0;
  }

  repaintCount(routeId: string): number {
    return this.frames.get(routeId)?.repaints ?? 0;
  }

  frame(routeId: string): StoredFrame | null {
    return this.frames.get(routeId) ?? null;
  }

  publish(_routeId: string, _revision: number): void {}

  onFrame(routeId: string, listener: ((frame: StoredFrame) => void) | null): void {
    if (listener) this.listeners.set(routeId, listener);
    else this.listeners.delete(routeId);
  }

  close(routeId: string): void {
    const cleanup = this.cleanups.get(routeId);
    this.cleanups.delete(routeId);
    cleanup?.();
    const window = this.windows.get(routeId);
    this.windows.delete(routeId);
    this.frames.delete(routeId);
    this.listeners.delete(routeId);
    this.pending.delete(routeId);
    this.convertScheduled.delete(routeId);
    this.bgraPools.delete(routeId);
    if (window && !window.isDestroyed()) window.destroy();
  }
}
