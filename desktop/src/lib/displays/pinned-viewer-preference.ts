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
