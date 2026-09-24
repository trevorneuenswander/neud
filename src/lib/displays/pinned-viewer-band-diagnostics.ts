export type PinnedBandFailureStage =
  | "preference_height_missing"
  | "preference_height_zero"
  | "preference_height_invalid"
  | "clamp_returns_zero"
  | "css_height_overridden"
  | "flex_collapse"
  | "grid_collapse"
  | "parent_height_zero"
  | "handle_overlay_only"
  | "viewer_content_hidden"
  | "none";

export type PinnedBandLayoutSnapshot = {
  pinnedDisplayCount: number;
  viewerHeightPx: number;
  effectiveViewerHeightPx: number;
  bandStyleHeight: string;
  bandComputedHeight: number;
  bandMinHeight: string;
  bandMaxHeight: string;
  resizeHandleHeight: number;
  outerBandComputedHeight: number;
  firstPinnedBandFailureStage: PinnedBandFailureStage;
};

export function isPinnedViewerBandDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (window.localStorage.getItem("neud:pinned-viewer-band-debug") === "1") {
    return true;
  }
  try {
    return new URLSearchParams(window.location.search).get("pinnedViewerBandDebug") === "1";
  } catch {
    return false;
  }
}

export function evaluatePinnedBandFailureStage(input: {
  pinnedDisplayCount: number;
  effectiveViewerHeightPx: number;
  contentComputedHeight: number;
  outerComputedHeight: number;
  handleHeightPx: number;
}): PinnedBandFailureStage {
  const { pinnedDisplayCount, effectiveViewerHeightPx, contentComputedHeight, outerComputedHeight, handleHeightPx } =
    input;

  if (pinnedDisplayCount <= 0) {
    return "none";
  }

  if (!Number.isFinite(effectiveViewerHeightPx) || effectiveViewerHeightPx <= 0) {
    return "preference_height_invalid";
  }

  if (contentComputedHeight <= handleHeightPx + 4 && outerComputedHeight <= handleHeightPx + 8) {
    return "handle_overlay_only";
  }

  if (contentComputedHeight < 40 && effectiveViewerHeightPx >= 160) {
    return "css_height_overridden";
  }

  if (contentComputedHeight <= 0) {
    return "flex_collapse";
  }

  return "none";
}

export function logPinnedBandLayoutSnapshot(snapshot: PinnedBandLayoutSnapshot): void {
  if (!isPinnedViewerBandDebugEnabled()) {
    return;
  }
  console.info("[neud pinned viewer band]", snapshot);
}
