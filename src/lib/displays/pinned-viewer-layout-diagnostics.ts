export type PinnedLayoutFailureStage =
  | "band_oversized"
  | "grid_oversized"
  | "slot_oversized"
  | "preview_wrapper_native_size"
  | "iframe_native_size"
  | "transform_missing"
  | "invalid_scale"
  | "zero_observer_bounds"
  | "stacking_context_escape"
  | "none";

export type PinnedViewerLayoutSnapshot = {
  firstPinnedLayoutFailureStage: PinnedLayoutFailureStage;
  windowInnerWidth: number;
  windowInnerHeight: number;
  devicePixelRatio: number;
  projectShell: DOMRect | null;
  sidebar: DOMRect | null;
  pinnedBand: DOMRect | null;
  pinnedGrid: DOMRect | null;
  pinnedSlot: DOMRect | null;
  previewRegion: DOMRect | null;
  previewWrapper: DOMRect | null;
  previewContainer: DOMRect | null;
  iframe: DOMRect | null;
  stageWidth: number;
  stageHeight: number;
  computedTransform: string;
  computedTransformOrigin: string;
  computedScale: number | null;
  configuredBandHeightPx: number | null;
};

const BAND_OVERSIZE_TOLERANCE_PX = 48;
const IFRAME_VIEWPORT_COVER_RATIO = 0.85;

function rect(el: Element | null | undefined): DOMRect | null {
  return el instanceof HTMLElement ? el.getBoundingClientRect() : null;
}

function parseScaleFromTransform(transform: string): number | null {
  if (!transform || transform === "none") {
    return 1;
  }
  const matrix = transform.match(/matrix\(([^)]+)\)/);
  if (matrix) {
    const parts = matrix[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (parts.length >= 1 && Number.isFinite(parts[0])) {
      return parts[0];
    }
  }
  const scale3d = transform.match(/scale3d\(([^)]+)\)/);
  if (scale3d) {
    const first = Number.parseFloat(scale3d[1].split(",")[0]?.trim() ?? "");
    return Number.isFinite(first) ? first : null;
  }
  const scale = transform.match(/scale\(([^)]+)\)/);
  if (scale) {
    const first = Number.parseFloat(scale[1].split(",")[0]?.trim() ?? "");
    return Number.isFinite(first) ? first : null;
  }
  return null;
}

export function isPinnedViewerLayoutDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (window.localStorage.getItem("neud:pinned-viewer-layout-debug") === "1") {
    return true;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("pinnedViewerLayoutDebug") === "1";
  } catch {
    return false;
  }
}

export function computePinnedPreviewMaxWidth(params: {
  regionWidth: number;
  regionHeight: number;
  displayWidth: number;
  displayHeight: number;
}): number {
  const { regionWidth, regionHeight, displayWidth, displayHeight } = params;
  if (
    regionWidth <= 0 ||
    regionHeight <= 0 ||
    displayWidth <= 0 ||
    displayHeight <= 0
  ) {
    return 0;
  }
  const widthFromHeight = regionHeight * (displayWidth / displayHeight);
  return Math.floor(Math.min(regionWidth, widthFromHeight));
}

export function evaluatePinnedPreviewSafety(params: {
  bandRect: DOMRect | null;
  slotRect: DOMRect | null;
  iframeRect: DOMRect | null;
  stageWidth: number;
  stageHeight: number;
  computedScale: number | null;
  configuredBandHeightPx: number | null;
}): PinnedLayoutFailureStage {
  const {
    bandRect,
    slotRect,
    iframeRect,
    stageWidth,
    stageHeight,
    computedScale,
    configuredBandHeightPx,
  } = params;

  if (configuredBandHeightPx != null && bandRect) {
    if (bandRect.height > configuredBandHeightPx + BAND_OVERSIZE_TOLERANCE_PX) {
      return "band_oversized";
    }
  }

  if (stageWidth <= 0 || stageHeight <= 0) {
    return "zero_observer_bounds";
  }

  if (computedScale != null) {
    if (!Number.isFinite(computedScale)) {
      return "invalid_scale";
    }
    if (computedScale <= 0 || computedScale > 2) {
      return "invalid_scale";
    }
  }

  if (iframeRect && typeof window !== "undefined") {
    const coversViewport =
      iframeRect.width >= window.innerWidth * IFRAME_VIEWPORT_COVER_RATIO &&
      iframeRect.height >= window.innerHeight * IFRAME_VIEWPORT_COVER_RATIO;
    if (coversViewport) {
      return "iframe_native_size";
    }
  }

  if (iframeRect && bandRect) {
    if (
      iframeRect.height > bandRect.height + BAND_OVERSIZE_TOLERANCE_PX ||
      iframeRect.width > bandRect.width + BAND_OVERSIZE_TOLERANCE_PX
    ) {
      return "preview_wrapper_native_size";
    }
  }

  if (slotRect && bandRect && slotRect.height > bandRect.height + BAND_OVERSIZE_TOLERANCE_PX) {
    return "slot_oversized";
  }

  return "none";
}

export function capturePinnedViewerLayoutSnapshot(
  configuredBandHeightPx: number | null,
): PinnedViewerLayoutSnapshot {
  if (typeof document === "undefined") {
    return {
      firstPinnedLayoutFailureStage: "none",
      windowInnerWidth: 0,
      windowInnerHeight: 0,
      devicePixelRatio: 1,
      projectShell: null,
      sidebar: null,
      pinnedBand: null,
      pinnedGrid: null,
      pinnedSlot: null,
      previewRegion: null,
      previewWrapper: null,
      previewContainer: null,
      iframe: null,
      stageWidth: 0,
      stageHeight: 0,
      computedTransform: "",
      computedTransformOrigin: "",
      computedScale: null,
      configuredBandHeightPx,
    };
  }

  const band = document.querySelector("[data-pinned-viewer-height]");
  const grid = band?.querySelector(":scope > div");
  const slot = document.querySelector("[data-pinned-slot]");
  const previewRegion = slot?.querySelector("[data-pinned-preview-region]");
  const previewWrapper = slot?.querySelector("[data-pinned-preview-wrapper]");
  const previewContainer = previewWrapper?.querySelector("[class*='aspect']") ??
    previewWrapper?.querySelector(".relative.overflow-hidden");
  const iframe = slot?.querySelector("iframe");

  const stageWidth = previewContainer instanceof HTMLElement ? previewContainer.clientWidth : 0;
  const stageHeight = previewContainer instanceof HTMLElement ? previewContainer.clientHeight : 0;

  let computedTransform = "";
  let computedTransformOrigin = "";
  let computedScale: number | null = null;
  if (iframe instanceof HTMLElement) {
    const styles = window.getComputedStyle(iframe);
    computedTransform = styles.transform;
    computedTransformOrigin = styles.transformOrigin;
    computedScale = parseScaleFromTransform(computedTransform);
  }

  const pinnedBand = rect(band);
  const failureStage = evaluatePinnedPreviewSafety({
    bandRect: pinnedBand,
    slotRect: rect(slot),
    iframeRect: rect(iframe),
    stageWidth,
    stageHeight,
    computedScale,
    configuredBandHeightPx,
  });

  return {
    firstPinnedLayoutFailureStage: failureStage,
    windowInnerWidth: window.innerWidth,
    windowInnerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    projectShell: rect(document.querySelector(".project-layout-root")),
    sidebar: rect(document.querySelector(".app-shell aside")),
    pinnedBand,
    pinnedGrid: rect(grid),
    pinnedSlot: rect(slot),
    previewRegion: rect(previewRegion),
    previewWrapper: rect(previewWrapper),
    previewContainer: rect(previewContainer),
    iframe: rect(iframe),
    stageWidth,
    stageHeight,
    computedTransform,
    computedTransformOrigin,
    computedScale,
    configuredBandHeightPx,
  };
}

export function logPinnedViewerLayoutSnapshot(snapshot: PinnedViewerLayoutSnapshot): void {
  if (!isPinnedViewerLayoutDebugEnabled()) {
    return;
  }
  console.info("[neud pinned viewer layout]", snapshot);
}
