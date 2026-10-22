/** @deprecated Use MAX_PINNED_VISIBLE_SLOTS for visible window slot limits. */
export const MAX_PINNED_DISPLAYS = 4;

export const MAX_PINNED_VISIBLE_SLOTS = 4;

export const DEFAULT_PINNED_VIEWER_HEIGHT_PX = 220;
export const MIN_PINNED_VIEWER_HEIGHT_PX = 160;
export const MAX_PINNED_VIEWER_HEIGHT_PX = 720;

export type PinnedViewerEligibleDisplay = {
  id: string;
  enabled: boolean;
  archived: boolean;
};

export function clampPinnedViewerHeight(
  value: number,
  viewportHeight?: number,
): number {
  let max = MAX_PINNED_VIEWER_HEIGHT_PX;
  if (typeof viewportHeight === "number" && Number.isFinite(viewportHeight) && viewportHeight > 0) {
    max = Math.min(max, Math.floor(viewportHeight * 0.5));
  }
  max = Math.max(max, MIN_PINNED_VIEWER_HEIGHT_PX);
  if (!Number.isFinite(value)) {
    value = DEFAULT_PINNED_VIEWER_HEIGHT_PX;
  }
  return Math.min(max, Math.max(MIN_PINNED_VIEWER_HEIGHT_PX, Math.round(value)));
}

/** Coerce persisted/API heights; invalid values become default before clamping. */
export function normalizePinnedViewerHeight(
  value: unknown,
  viewportHeight?: number,
): number {
  let numeric = DEFAULT_PINNED_VIEWER_HEIGHT_PX;
  if (typeof value === "number") {
    numeric = value;
  } else if (typeof value === "string" && value.trim()) {
    numeric = Number(value);
  }
  if (!Number.isFinite(numeric) || numeric <= 0) {
    numeric = DEFAULT_PINNED_VIEWER_HEIGHT_PX;
  }
  return clampPinnedViewerHeight(numeric, viewportHeight);
}

/**
 * SSR / pre-mount fallback for the layout-anchor cap.
 * Deterministic — never reads browser globals.
 */
export const PINNED_ANCHOR_MAX_HEIGHT_SSR_FALLBACK_PX = MAX_PINNED_VIEWER_HEIGHT_PX;

/**
 * Half of the layout anchor (project root / main content), clamped to pinned limits.
 * Pure — safe for SSR and unit tests. Pass measured DOM height only after mount.
 */
export function computePinnedAnchorMaxHeightPx(anchorHeightPx: number | null | undefined): number {
  if (
    typeof anchorHeightPx !== "number" ||
    !Number.isFinite(anchorHeightPx) ||
    anchorHeightPx <= 0
  ) {
    return PINNED_ANCHOR_MAX_HEIGHT_SSR_FALLBACK_PX;
  }
  const anchor = Math.floor(anchorHeightPx);
  return clampPinnedViewerHeight(Math.floor(anchor * 0.5), anchor);
}

/**
 * Content-fit is the maximum pinned height for the current pin count, further
 * capped by the layout-anchor half-height.
 */
export function resolvePinnedMaxHeightPx(input: {
  contentFitHeightPx: number;
  anchorHeightPx?: number | null;
}): number {
  const contentFit = Math.max(MIN_PINNED_VIEWER_HEIGHT_PX, Math.floor(input.contentFitHeightPx));
  const anchorMax = computePinnedAnchorMaxHeightPx(input.anchorHeightPx);
  return Math.min(contentFit, anchorMax);
}

/**
 * Pass 7 contract: min <= userHeight <= calculatedMax.
 * Default schema height means "unset" → follow max until the operator resizes.
 */
export function resolvePinnedEffectiveHeightPx(input: {
  storedHeightPx: number | null | undefined;
  maxPinnedHeightPx: number;
  dragHeightPx?: number | null;
  viewportHeightPx?: number | null;
}): number {
  const maxPinned = Math.max(MIN_PINNED_VIEWER_HEIGHT_PX, Math.floor(input.maxPinnedHeightPx));
  const viewport =
    typeof input.viewportHeightPx === "number" && Number.isFinite(input.viewportHeightPx)
      ? input.viewportHeightPx
      : undefined;

  if (typeof input.dragHeightPx === "number" && Number.isFinite(input.dragHeightPx)) {
    return Math.min(normalizePinnedViewerHeight(input.dragHeightPx, viewport), maxPinned);
  }

  const stored = input.storedHeightPx;
  const hasCustomHeight =
    typeof stored === "number" &&
    Number.isFinite(stored) &&
    stored !== DEFAULT_PINNED_VIEWER_HEIGHT_PX;

  const preferred = hasCustomHeight ? stored : maxPinned;
  return Math.min(normalizePinnedViewerHeight(preferred, viewport), maxPinned);
}

export function parsePinnedDisplayIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of raw) {
    const id = typeof entry === "string" ? entry.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function sanitizePinnedDisplayIds(
  pinnedIds: string[],
  displays: PinnedViewerEligibleDisplay[],
): { pinnedDisplayIds: string[]; removedIds: string[] } {
  const byId = new Map(displays.map((display) => [display.id, display]));
  const removedIds: string[] = [];
  const next: string[] = [];

  for (const id of parsePinnedDisplayIds(pinnedIds)) {
    const display = byId.get(id);
    if (!display || display.archived || !display.enabled) {
      removedIds.push(id);
      continue;
    }
    next.push(id);
  }

  return { pinnedDisplayIds: next, removedIds };
}

/** Pinned left-to-right order follows authoritative display list order (no separate pin order). */
export function orderPinnedDisplayIds(
  pinnedIds: string[],
  displayListOrderIds: string[],
): string[] {
  const pinnedSet = new Set(parsePinnedDisplayIds(pinnedIds));
  return displayListOrderIds.filter((id) => pinnedSet.has(id));
}

export function canPinDisplay(display: PinnedViewerEligibleDisplay): boolean {
  return display.enabled && !display.archived;
}

export function mergePinnedViewerPreferenceByUpdatedAt<
  T extends {
    updatedAt: string;
    pinnedDisplayIds: string[];
    viewerHeightPx: number;
    pinnedStacks?: import("./pinned-viewer-stacks").PinnedStackRecord[];
  },
>(local: T, remote: T, viewportHeight?: number): T {
  const normalizedLocal = {
    ...local,
    viewerHeightPx: normalizePinnedViewerHeight(local.viewerHeightPx, viewportHeight),
    pinnedStacks: local.pinnedStacks ?? [],
  };
  const normalizedRemote = {
    ...remote,
    viewerHeightPx: normalizePinnedViewerHeight(remote.viewerHeightPx, viewportHeight),
    pinnedStacks: remote.pinnedStacks ?? [],
  };
  const localTime = Date.parse(normalizedLocal.updatedAt);
  const remoteTime = Date.parse(normalizedRemote.updatedAt);
  if (Number.isFinite(remoteTime) && (!Number.isFinite(localTime) || remoteTime > localTime)) {
    return normalizedRemote;
  }
  return normalizedLocal;
}
