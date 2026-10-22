/**
 * Key + Fill semantic frame processor (Phase 2B.2A).
 *
 * Operates on the canonical NEUD source buffer (8-bit BGRA, verified Chromium contract).
 * Does NOT encode SDI video-range or YUV — those belong at the device pixel-format boundary.
 *
 * Pipeline separation:
 *   Source → semantic Fill/Key → (future) BGRA|YUV encoder → hardware scheduler
 */

import type { ExternalKeyPolarity, ExternalSourceAlphaMode } from "./external-output-capabilities.ts";

export type KeyFillChannelOrder = "bgra";

export type KeyFillSourceContract = {
  channelOrder: KeyFillChannelOrder;
  bytesPerPixel: 4;
  /** Verified Chromium/Electron toBitmap representation after NEUD BGRA normalize. */
  alphaMode: ExternalSourceAlphaMode;
  /** Row-major, tightly packed (rowBytes = width * 4). */
  rowLayout: "tight";
  /** Colorspace at this stage is display/sRGB authored pixels; Rec.601/709 apply at SDI encode. */
  colorspace: "display-srgb";
};

/**
 * Canonical contract after Chromium verification (Phase 2B.2A live probe).
 * Electron offscreen `toBitmap()` delivers premultiplied BGRA on the validated macOS runtime.
 */
export const NEUD_KEY_FILL_SOURCE_CONTRACT: KeyFillSourceContract = {
  channelOrder: "bgra",
  bytesPerPixel: 4,
  alphaMode: "premultiplied",
  rowLayout: "tight",
  colorspace: "display-srgb",
};

export type KeyFillFramePair = {
  frameNumber: number;
  displayTime: number;
  displayDuration: number;
  timeScale: number;
  width: number;
  height: number;
  sourceRevision: number;
  sourceAlphaMode: ExternalSourceAlphaMode;
  fillAlphaMode: "premultiplied";
  keyPolarity: ExternalKeyPolarity;
  /** Untouched copy of source BGRA. */
  source: Uint8Array;
  /** Premultiplied BGRA Fill (alpha channel copied from source for intermediate use). */
  fill: Uint8Array;
  /** Grayscale Key BGRA (R=G=B=K, A=255). */
  key: Uint8Array;
  processingMs: number;
};

export type KeyFillProcessOptions = {
  frameNumber: number;
  displayTime: number;
  displayDuration: number;
  timeScale: number;
  width: number;
  height: number;
  sourceRevision?: number;
  /** Defaults to verified straight. */
  sourceAlphaMode?: ExternalSourceAlphaMode;
  keyPolarity?: ExternalKeyPolarity;
};

export const KEY_FILL_PROCESS_ERROR = "Key + Fill frame processing failed";

/** Exact integer: round(channel * alpha / 255). */
export function scaleChannelByAlpha(channel: number, alpha: number): number {
  return Math.round((channel * alpha) / 255);
}

/**
 * Unpremultiply one channel for DeckLink native external keying.
 * Official KeyerOutput sample feeds straight ARGB32 as BGRA.
 */
export function unpremultiplyChannel(channel: number, alpha: number): number {
  if (alpha <= 0) return 0;
  if (alpha >= 255) return channel;
  return Math.min(255, Math.round((channel * 255) / alpha));
}

/** Key luma from alpha with polarity. Normal: white=opaque. */
export function keyLumaFromAlphaPolarity(
  alpha: number,
  polarity: ExternalKeyPolarity = "whiteOnBlack",
): number {
  const clamped = Math.max(0, Math.min(255, alpha | 0));
  if (polarity === "blackOnWhite") return 255 - clamped;
  return clamped;
}

/**
 * Generate Key plane into `out` (must be length >= source.length).
 * Does not mutate source. Intermediate Key is full-range grayscale BGRA.
 */
export function generateKeyFrame(
  sourceBgra: Uint8Array,
  out: Uint8Array,
  polarity: ExternalKeyPolarity = "whiteOnBlack",
): void {
  if (out.length < sourceBgra.length) {
    throw new Error("Key output buffer too small");
  }
  for (let i = 0; i + 3 < sourceBgra.length; i += 4) {
    const k = keyLumaFromAlphaPolarity(sourceBgra[i + 3] ?? 0, polarity);
    out[i] = k;
    out[i + 1] = k;
    out[i + 2] = k;
    out[i + 3] = 255;
  }
}

/**
 * Generate Fill plane into `out` from verified straight-alpha source.
 * Fill RGB is premultiplied; alpha channel preserved from source for diagnostics.
 * Does not mutate source.
 */
export function generateFillFramePremultiplied(sourceBgra: Uint8Array, out: Uint8Array): void {
  if (out.length < sourceBgra.length) {
    throw new Error("Fill output buffer too small");
  }
  for (let i = 0; i + 3 < sourceBgra.length; i += 4) {
    const b = sourceBgra[i] ?? 0;
    const g = sourceBgra[i + 1] ?? 0;
    const r = sourceBgra[i + 2] ?? 0;
    const a = sourceBgra[i + 3] ?? 0;
    out[i] = scaleChannelByAlpha(b, a);
    out[i + 1] = scaleChannelByAlpha(g, a);
    out[i + 2] = scaleChannelByAlpha(r, a);
    out[i + 3] = a;
  }
}

/**
 * If source is already premultiplied, Fill reuses a copy (no re-premultiply).
 */
export function generateFillFrameFromSource(
  sourceBgra: Uint8Array,
  out: Uint8Array,
  sourceAlphaMode: ExternalSourceAlphaMode,
): void {
  if (sourceAlphaMode === "premultiplied") {
    out.set(sourceBgra);
    return;
  }
  generateFillFramePremultiplied(sourceBgra, out);
}

/**
 * Atomic Fill + Key pair from one source frame.
 * On any failure, neither plane is returned for scheduling.
 */
export function createKeyFillFramePair(
  sourceBgra: Uint8Array,
  options: KeyFillProcessOptions,
): { ok: true; pair: KeyFillFramePair } | { ok: false; error: string } {
  const started = performance.now();
  try {
    const expected = options.width * options.height * 4;
    if (sourceBgra.length < expected) {
      return { ok: false, error: `${KEY_FILL_PROCESS_ERROR}: source buffer short` };
    }
    if (options.width < 1 || options.height < 1) {
      return { ok: false, error: `${KEY_FILL_PROCESS_ERROR}: invalid dimensions` };
    }

    const sourceAlphaMode = options.sourceAlphaMode ?? NEUD_KEY_FILL_SOURCE_CONTRACT.alphaMode;
    const keyPolarity = options.keyPolarity ?? "whiteOnBlack";

    // Immutable source copy — Fill-only black composite and Key+Fill both derive from copies.
    const source = Uint8Array.from(sourceBgra);
    const fill = new Uint8Array(expected);
    const key = new Uint8Array(expected);

    generateFillFrameFromSource(source, fill, sourceAlphaMode);
    generateKeyFrame(source, key, keyPolarity);

    // Integrity: source must remain identical to the input snapshot.
    for (let i = 0; i < expected; i += 1) {
      if (source[i] !== sourceBgra[i]) {
        return { ok: false, error: `${KEY_FILL_PROCESS_ERROR}: source mutated` };
      }
    }

    const processingMs = performance.now() - started;
    return {
      ok: true,
      pair: {
        frameNumber: options.frameNumber,
        displayTime: options.displayTime,
        displayDuration: options.displayDuration,
        timeScale: options.timeScale,
        width: options.width,
        height: options.height,
        sourceRevision: options.sourceRevision ?? 0,
        sourceAlphaMode,
        fillAlphaMode: "premultiplied",
        keyPolarity,
        source,
        fill,
        key,
        processingMs,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: `${KEY_FILL_PROCESS_ERROR}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Software reference for a typical external keyer with premultiplied Fill + white-on-black Key:
 *   Program = Fill + Background * (1 - Key/255)
 */
export function compositePremultipliedFillOverBackground(
  fillBgra: Uint8Array,
  keyBgra: Uint8Array,
  backgroundRgb: { r: number; g: number; b: number },
  out: Uint8Array,
): void {
  const len = Math.min(fillBgra.length, keyBgra.length, out.length);
  for (let i = 0; i + 3 < len; i += 4) {
    const k = keyBgra[i] ?? 0; // grayscale — any channel
    const oneMinus = (255 - k) / 255;
    out[i] = Math.round((fillBgra[i] ?? 0) + backgroundRgb.b * oneMinus);
    out[i + 1] = Math.round((fillBgra[i + 1] ?? 0) + backgroundRgb.g * oneMinus);
    out[i + 2] = Math.round((fillBgra[i + 2] ?? 0) + backgroundRgb.r * oneMinus);
    out[i + 3] = 255;
  }
}

/**
 * Reference composition from straight-alpha source over an opaque background
 * (Skia-style: src-over). Used to validate Fill+Key reconstruction.
 */
export function compositeStraightSourceOverBackground(
  sourceBgra: Uint8Array,
  backgroundRgb: { r: number; g: number; b: number },
  out: Uint8Array,
): void {
  for (let i = 0; i + 3 < sourceBgra.length && i + 3 < out.length; i += 4) {
    const a = (sourceBgra[i + 3] ?? 0) / 255;
    out[i] = Math.round((sourceBgra[i] ?? 0) * a + backgroundRgb.b * (1 - a));
    out[i + 1] = Math.round((sourceBgra[i + 1] ?? 0) * a + backgroundRgb.g * (1 - a));
    out[i + 2] = Math.round((sourceBgra[i + 2] ?? 0) * a + backgroundRgb.r * (1 - a));
    out[i + 3] = 255;
  }
}

export function readBgraPixel(
  buffer: Uint8Array,
  offset: number,
): { b: number; g: number; r: number; a: number } {
  return {
    b: buffer[offset] ?? 0,
    g: buffer[offset + 1] ?? 0,
    r: buffer[offset + 2] ?? 0,
    a: buffer[offset + 3] ?? 0,
  };
}

/** Write a single straight BGRA pixel into a buffer. */
export function writeStraightBgraPixel(
  buffer: Uint8Array,
  offset: number,
  pixel: { r: number; g: number; b: number; a: number },
): void {
  buffer[offset] = pixel.b;
  buffer[offset + 1] = pixel.g;
  buffer[offset + 2] = pixel.r;
  buffer[offset + 3] = pixel.a;
}

export type KeyFillProcessorDiagnostics = {
  sourceFrameFormat: "bgra8";
  sourceAlphaRepresentation: ExternalSourceAlphaMode;
  fillAlphaRepresentation: "premultiplied";
  keyPolarity: ExternalKeyPolarity;
  framePairNumber: number;
  frameProcessingMs: number;
};

export function diagnosticsFromPair(pair: KeyFillFramePair): KeyFillProcessorDiagnostics {
  return {
    sourceFrameFormat: "bgra8",
    sourceAlphaRepresentation: pair.sourceAlphaMode,
    fillAlphaRepresentation: pair.fillAlphaMode,
    keyPolarity: pair.keyPolarity,
    framePairNumber: pair.frameNumber,
    frameProcessingMs: pair.processingMs,
  };
}

/** Benchmark helper — allocate once, convert many times. */
export function benchmarkKeyFillProcessing(input: {
  width: number;
  height: number;
  iterations?: number;
}): {
  width: number;
  height: number;
  iterations: number;
  fillMs: number;
  keyMs: number;
  bothMs: number;
  fillMsPerFrame: number;
  keyMsPerFrame: number;
  bothMsPerFrame: number;
} {
  const iterations = Math.max(1, input.iterations ?? 8);
  const bytes = input.width * input.height * 4;
  const source = new Uint8Array(bytes);
  for (let i = 0; i + 3 < bytes; i += 4) {
    source[i] = 40;
    source[i + 1] = 80;
    source[i + 2] = 200;
    source[i + 3] = 180;
  }
  const fill = new Uint8Array(bytes);
  const key = new Uint8Array(bytes);

  // Production path for verified Chromium premul source: Fill = copy, Key = alpha extract.
  const fillStart = performance.now();
  for (let n = 0; n < iterations; n += 1) generateFillFrameFromSource(source, fill, "premultiplied");
  const fillMs = performance.now() - fillStart;

  const keyStart = performance.now();
  for (let n = 0; n < iterations; n += 1) generateKeyFrame(source, key, "whiteOnBlack");
  const keyMs = performance.now() - keyStart;

  const bothStart = performance.now();
  for (let n = 0; n < iterations; n += 1) {
    generateFillFrameFromSource(source, fill, "premultiplied");
    generateKeyFrame(source, key, "whiteOnBlack");
  }
  const bothMs = performance.now() - bothStart;

  return {
    width: input.width,
    height: input.height,
    iterations,
    fillMs,
    keyMs,
    bothMs,
    fillMsPerFrame: fillMs / iterations,
    keyMsPerFrame: keyMs / iterations,
    bothMsPerFrame: bothMs / iterations,
  };
}
