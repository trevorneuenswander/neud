"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_PINNED_VIEWER_HEIGHT_PX = exports.MIN_PINNED_VIEWER_HEIGHT_PX = exports.DEFAULT_PINNED_VIEWER_HEIGHT_PX = exports.MAX_PINNED_VISIBLE_SLOTS = exports.MAX_PINNED_DISPLAYS = void 0;
exports.clampPinnedViewerHeight = clampPinnedViewerHeight;
exports.normalizePinnedViewerHeight = normalizePinnedViewerHeight;
exports.parsePinnedDisplayIds = parsePinnedDisplayIds;
exports.sanitizePinnedDisplayIds = sanitizePinnedDisplayIds;
exports.orderPinnedDisplayIds = orderPinnedDisplayIds;
exports.canPinDisplay = canPinDisplay;
exports.mergePinnedViewerPreferenceByUpdatedAt = mergePinnedViewerPreferenceByUpdatedAt;
/** @deprecated Use MAX_PINNED_VISIBLE_SLOTS for visible window slot limits. */
exports.MAX_PINNED_DISPLAYS = 4;
exports.MAX_PINNED_VISIBLE_SLOTS = 4;
exports.DEFAULT_PINNED_VIEWER_HEIGHT_PX = 220;
exports.MIN_PINNED_VIEWER_HEIGHT_PX = 160;
exports.MAX_PINNED_VIEWER_HEIGHT_PX = 720;
function clampPinnedViewerHeight(value, viewportHeight) {
    let max = exports.MAX_PINNED_VIEWER_HEIGHT_PX;
    if (typeof viewportHeight === "number" && Number.isFinite(viewportHeight) && viewportHeight > 0) {
        max = Math.min(max, Math.floor(viewportHeight * 0.5));
    }
    max = Math.max(max, exports.MIN_PINNED_VIEWER_HEIGHT_PX);
    if (!Number.isFinite(value)) {
        value = exports.DEFAULT_PINNED_VIEWER_HEIGHT_PX;
    }
    return Math.min(max, Math.max(exports.MIN_PINNED_VIEWER_HEIGHT_PX, Math.round(value)));
}
/** Coerce persisted/API heights; invalid values become default before clamping. */
function normalizePinnedViewerHeight(value, viewportHeight) {
    let numeric = exports.DEFAULT_PINNED_VIEWER_HEIGHT_PX;
    if (typeof value === "number") {
        numeric = value;
    }
    else if (typeof value === "string" && value.trim()) {
        numeric = Number(value);
    }
    if (!Number.isFinite(numeric) || numeric <= 0) {
        numeric = exports.DEFAULT_PINNED_VIEWER_HEIGHT_PX;
    }
    return clampPinnedViewerHeight(numeric, viewportHeight);
}
function parsePinnedDisplayIds(raw) {
    if (!Array.isArray(raw)) {
        return [];
    }
    const seen = new Set();
    const ids = [];
    for (const entry of raw) {
        const id = typeof entry === "string" ? entry.trim() : "";
        if (!id || seen.has(id))
            continue;
        seen.add(id);
        ids.push(id);
    }
    return ids;
}
function sanitizePinnedDisplayIds(pinnedIds, displays) {
    const byId = new Map(displays.map((display) => [display.id, display]));
    const removedIds = [];
    const next = [];
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
function orderPinnedDisplayIds(pinnedIds, displayListOrderIds) {
    const pinnedSet = new Set(parsePinnedDisplayIds(pinnedIds));
    return displayListOrderIds.filter((id) => pinnedSet.has(id));
}
function canPinDisplay(display) {
    return display.enabled && !display.archived;
}
function mergePinnedViewerPreferenceByUpdatedAt(local, remote, viewportHeight) {
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
