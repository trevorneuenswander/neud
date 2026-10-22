export const DECKLINK_FILL_PIXEL_FORMAT = "bgra8" as const;
export const DECKLINK_FILL_BACKGROUND = "#000000";
export const DECKLINK_PREROLL_FRAMES = 3;

/** Developer / diagnostics copy. Operator UI uses EXTERNAL_DEVICE_* helpers. */
export const DECKLINK_SDK_UNAVAILABLE =
  "Blackmagic DeckLink is unavailable. Install Blackmagic Desktop Video and restart NEUD.";
/** Operator-facing external-device unavailable (session / start). */
export const DECKLINK_DEVICE_UNAVAILABLE = "External device unavailable";
export const DECKLINK_MODE_UNSUPPORTED = "Configured video mode is no longer available.";
export const DECKLINK_PIXEL_FORMAT_UNSUPPORTED =
  "BGRA 8-bit is not supported for the selected video mode.";
export const DECKLINK_ENABLE_FAILED = "Unable to enable video output";
export const DECKLINK_PLAYBACK_FAILED = "Scheduled playback failed";
export const DECKLINK_UNDERRUN = "Output timing underrun";
export const DECKLINK_DEVICE_REMOVED = "Device removed";
export const DECKLINK_NO_DEVICES = "No external output devices detected.";
export const DECKLINK_FIRST_FRAME_TIMEOUT = "Output did not receive a rendered frame";

export const EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE =
  "External device support is unavailable on this computer.";
/** Operator-facing: real addon loaded but Desktop Video runtime / iterator unavailable. */
export const EXTERNAL_DESKTOP_VIDEO_UNAVAILABLE = "Desktop Video runtime is unavailable.";
/** Operator-facing: native .node failed to load (path/ABI). */
export const EXTERNAL_NATIVE_ADDON_FAILED = "Native external-device helper failed to load.";
export const EXTERNAL_NO_DEVICES = "No external output devices detected.";

/** Map probe/load diagnostics to a short operator-facing message. */
export function operatorFacingExternalDeviceUnavailable(
  reason: string | null | undefined,
): string {
  const text = (reason ?? "").trim();
  if (!text) return EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE;
  if (
    text === EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE ||
    text === EXTERNAL_DESKTOP_VIDEO_UNAVAILABLE ||
    text === EXTERNAL_NATIVE_ADDON_FAILED ||
    text === EXTERNAL_NO_DEVICES
  ) {
    return text;
  }
  if (/stub/i.test(text) || /built without/i.test(text)) {
    return EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE;
  }
  if (/failed to load|native helper|addon/i.test(text)) {
    return EXTERNAL_NATIVE_ADDON_FAILED;
  }
  if (/Desktop Video|CreateDeckLinkIterator|runtime/i.test(text)) {
    return EXTERNAL_DESKTOP_VIDEO_UNAVAILABLE;
  }
  return EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE;
}

/** Operator-facing adapter label. Internal adapterType stays vendor-specific. */
export function adapterTypeToOperatorLabel(adapterType: string | null | undefined): string {
  switch (adapterType) {
    case "display":
      return "Computer Display";
    case "decklink":
      return "External Device";
    case "disk":
      return "Record to Disk";
    default:
      return "External Device";
  }
}

/** Operator port label: "<Device Model> Port <n>" (1-based). */
export function formatExternalPortLabel(modelName: string, endpointIndex: number): string {
  const model = modelName.trim() || "External Device";
  const portNumber = Number.isFinite(endpointIndex) ? Math.max(1, Math.floor(endpointIndex) + 1) : 1;
  return `${model} Port ${portNumber}`;
}

export type DeckLinkFieldDominance = "progressive" | "upper" | "lower" | "unknown";

export type DeckLinkVideoMode = {
  id: string;
  name: string;
  width: number;
  height: number;
  /** SDK GetFrameRate timescale (e.g. 60000 for 1080p59.94). */
  frameRateNumerator: number;
  /** SDK GetFrameRate frameDuration (e.g. 1001 for 1080p59.94). */
  frameRateDenominator: number;
  frameDuration?: number;
  frameTimescale?: number;
  interlaced: boolean;
  fieldDominance: DeckLinkFieldDominance;
  pixelFormats: string[];
};

export type DeckLinkRouteConfiguration = {
  outputEndpointId: string;
  persistentId: string;
  modelName: string;
  endpointName: string;
  endpointIndex: number;
  displayModeId: string;
  modeName: string;
  pixelFormat: typeof DECKLINK_FILL_PIXEL_FORMAT;
  fillBackground: string;
  frameRateNumerator: number;
  frameRateDenominator: number;
  width: number;
  height: number;
  /** fill (default) or keyFill. */
  presentationMode?: "fill" | "keyFill";
  /** nativeExternalKey (HD Mini) or pairedPorts (future dual schedule). */
  keyFillTransport?: "nativeExternalKey" | "pairedPorts";
  /** Required when presentationMode === "keyFill" and transport is pairedPorts. */
  keyEndpointId?: string | null;
  sourceAlphaMode?: "straight" | "premultiplied" | "unknown";
  /** Alpha representation written into DeckLink frames for native keyer. */
  deckLinkFrameAlphaMode?: "straight" | "premultiplied" | "unknown";
  fillAlphaMode?: "straight" | "premultiplied" | "blackComposite";
  keyPolarity?: "whiteOnBlack" | "blackOnWhite" | "unknown";
};

export type DeckLinkLiveMetrics = {
  sdkVersion: string | null;
  pixelFormat: string;
  deviceModel: string | null;
  persistentId: string | null;
  endpointIndex: number | null;
  displayModeId: string | null;
  modeName: string | null;
  displayModeName: string | null;
  frameRateNumerator: number | null;
  frameRateDenominator: number | null;
  frameDuration: number | null;
  frameTimescale: number | null;
  computedFpsForDisplayOnly: string | null;
  width: number | null;
  height: number | null;
  rendererWidth: number | null;
  rendererHeight: number | null;
  rowBytes: number | null;
  rendererPixelOrder: "bgra" | "rgba" | "unknown" | null;
  fillBackground: string;
  scheduledFrames: number;
  completedFrames: number;
  droppedFrames: number;
  lateFrames: number;
  underruns: number;
  reusedFrames: number;
  queueDepth: number;
  lastFrameCompletionAt: string | null;
  lastCompletionResult: string | null;
  lastScheduledRevision: number | null;
  rendererRevision: number;
  rendererRepaints: number;
  playbackStartedAt: string | null;
  playbackStarted: boolean;
  outputEnabled: boolean;
  lastError: string | null;
  nativeError: string | null;
  startStage: string | null;
};

export function deckLinkEndpointId(persistentId: string, endpointIndex: number): string {
  return `decklink:${persistentId}:${endpointIndex}`;
}

export function formatRationalFrameRate(numerator: number, denominator: number): string {
  return `${numerator}/${denominator}`;
}

/** Display-only FPS label. Never used for DeckLink scheduling. */
export function formatDisplayOnlyFps(numerator: number, denominator: number): string {
  if (numerator === 60000 && denominator === 1001) return "59.94";
  if (numerator === 30000 && denominator === 1001) return "29.97";
  if (numerator === 24000 && denominator === 1001) return "23.98";
  if (denominator > 0 && numerator % denominator === 0) return String(numerator / denominator);
  if (denominator <= 0) return "";
  return `${numerator}/${denominator}`;
}

/**
 * Operator-facing mode order:
 * low → high resolution, interlaced before progressive, lower → higher frame rate.
 * Does not invent modes — only sorts SDK-reported entries.
 */
export function sortDeckLinkModes(modes: DeckLinkVideoMode[]): DeckLinkVideoMode[] {
  return [...modes].sort((left, right) => {
    if (left.height !== right.height) return left.height - right.height;
    if (left.width !== right.width) return left.width - right.width;
    if (left.interlaced !== right.interlaced) return left.interlaced ? -1 : 1;
    const leftFps =
      left.frameRateDenominator > 0 ? left.frameRateNumerator / left.frameRateDenominator : 0;
    const rightFps =
      right.frameRateDenominator > 0 ? right.frameRateNumerator / right.frameRateDenominator : 0;
    if (leftFps !== rightFps) return leftFps - rightFps;
    return left.id.localeCompare(right.id) || left.name.localeCompare(right.name);
  });
}

/** Local timezone, human-readable start time for Output cards. */
export function formatOutputStartedAt(iso: string | null | undefined, locale?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `Started ${formatted}`;
}

export const OUTPUT_NAME_SEQUENCE_KEY = "output.nextSequence";

export function formatDefaultOutputName(sequence: number): string {
  return `Output ${Math.max(1, Math.floor(sequence))}`;
}

export function fitContainRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): { x: number; y: number; width: number; height: number } {
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) {
    return { x: 0, y: 0, width: targetWidth, height: targetHeight };
  }
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  return {
    x: Math.round((targetWidth - width) / 2),
    y: Math.round((targetHeight - height) / 2),
    width,
    height,
  };
}

/**
 * Premultiplied BGRA src-over an opaque background.
 * Cout = Cpremul + Cbg × (1 − A/255). Source buffer is not mutated.
 */
export function compositePremultipliedOverOpaqueBackground(
  premulBgra: Uint8Array,
  backgroundRgb: { r: number; g: number; b: number },
): Uint8Array {
  const out = new Uint8Array(premulBgra.length);
  for (let index = 0; index + 3 < premulBgra.length; index += 4) {
    const a = premulBgra[index + 3] ?? 0;
    if (a === 0) {
      out[index] = backgroundRgb.b;
      out[index + 1] = backgroundRgb.g;
      out[index + 2] = backgroundRgb.r;
      out[index + 3] = 255;
      continue;
    }
    if (a === 255) {
      out[index] = premulBgra[index] ?? 0;
      out[index + 1] = premulBgra[index + 1] ?? 0;
      out[index + 2] = premulBgra[index + 2] ?? 0;
      out[index + 3] = 255;
      continue;
    }
    const oneMinus = (255 - a) / 255;
    out[index] = Math.round((premulBgra[index] ?? 0) + backgroundRgb.b * oneMinus);
    out[index + 1] = Math.round((premulBgra[index + 1] ?? 0) + backgroundRgb.g * oneMinus);
    out[index + 2] = Math.round((premulBgra[index + 2] ?? 0) + backgroundRgb.r * oneMinus);
    out[index + 3] = 255;
  }
  return out;
}

/**
 * Fill-only: premultiplied Chromium BGRA over opaque black.
 *
 * Verified source is already premultiplied, so over black:
 *   Cout = Cpremul  (because Cblack = 0)
 *   Aout = 255
 *
 * Fully transparent (A=0) forces black regardless of residual RGB.
 * Source buffer is left unchanged.
 */
export function compositeFillOverBlack(bgra: Uint8Array): Uint8Array {
  return compositePremultipliedOverOpaqueBackground(bgra, { r: 0, g: 0, b: 0 });
}

/**
 * Normalize Electron/Skia paint bytes to DeckLink BGRA.
 * When `out` is provided and sized correctly, reuse it to avoid per-frame alloc.
 */
export function normalizePaintBufferToBgra(
  bitmap: Uint8Array | Buffer,
  order: "bgra" | "rgba" | "unknown",
  out?: Buffer,
): Buffer {
  const target =
    out && out.length === bitmap.length ? out : Buffer.allocUnsafe(bitmap.length);
  if (order !== "rgba") {
    if (Buffer.isBuffer(bitmap)) {
      bitmap.copy(target);
    } else {
      Buffer.from(bitmap.buffer, bitmap.byteOffset, bitmap.byteLength).copy(target);
    }
    return target;
  }
  for (let index = 0; index + 3 < bitmap.length; index += 4) {
    target[index] = bitmap[index + 2] ?? 0;
    target[index + 1] = bitmap[index + 1] ?? 0;
    target[index + 2] = bitmap[index] ?? 0;
    target[index + 3] = bitmap[index + 3] ?? 0;
  }
  return target;
}

export function buildDeckLinkRenderUrl(input: {
  origin: string;
  projectId: string;
  slug: string;
  authoredWidth: number;
  authoredHeight: number;
  /** DeckLink mode raster; window-fit scales the authored canvas into this viewport. */
  targetWidth?: number;
  targetHeight?: number;
}): string {
  const origin = input.origin.replace(/\/$/, "");
  const inner = new URLSearchParams({ mode: "output" });
  const outputPath = `${origin}/display/${encodeURIComponent(input.projectId)}/${encodeURIComponent(input.slug)}?${inner.toString()}`;
  const params = new URLSearchParams({
    target: outputPath,
    // Logical authored design size — DisplayViewerScaledCanvas CSS-transforms into the offscreen viewport.
    width: String(input.authoredWidth),
    height: String(input.authoredHeight),
    surface: "decklink",
  });
  if (input.targetWidth && input.targetHeight) {
    params.set("outputWidth", String(input.targetWidth));
    params.set("outputHeight", String(input.targetHeight));
  }
  return `${origin}/display/window-fit?${params.toString()}`;
}
