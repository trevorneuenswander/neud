"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeLotPhotoKey = normalizeLotPhotoKey;
exports.parseLotPhotoOverrides = parseLotPhotoOverrides;
exports.applyLotPhotoOverrides = applyLotPhotoOverrides;
exports.applyUsablePhotoFilters = applyUsablePhotoFilters;
const display_utils_1 = require("../../displays/display-utils");
function normalizeLotPhotoKey(lotNumber) {
    return lotNumber.replace(/^lot\s+/i, "").trim();
}
function extractOfflineAssetPath(url) {
    const match = url.match(/\/api\/offline-assets\/[^/]+\/(.+)$/i);
    if (!match?.[1])
        return null;
    try {
        return decodeURIComponent(match[1]).replace(/\\/g, "/");
    }
    catch {
        return match[1].replace(/\\/g, "/");
    }
}
function photoUrlKey(url) {
    const offlinePath = extractOfflineAssetPath(url);
    if (offlinePath) {
        return `local:${offlinePath}`;
    }
    return `url:${url}`;
}
function parseLotPhotoOverrides(value) {
    if (!value || typeof value !== "object")
        return {};
    const parsed = value;
    const result = {};
    for (const [key, entry] of Object.entries(parsed)) {
        if (!entry || typeof entry !== "object")
            continue;
        result[key] = {
            order: Array.isArray(entry.order)
                ? entry.order.filter((url) => typeof url === "string")
                : undefined,
            removed: Array.isArray(entry.removed)
                ? entry.removed.filter((url) => typeof url === "string")
                : undefined,
            added: Array.isArray(entry.added)
                ? entry.added.filter((url) => typeof url === "string")
                : undefined,
        };
    }
    return result;
}
function applyLotPhotoOverrides(photos, overrides, lotNumber) {
    const key = normalizeLotPhotoKey(lotNumber);
    const entry = overrides?.[key];
    if (!entry)
        return photos;
    const removed = new Set((entry.removed ?? []).map(photoUrlKey));
    let filtered = photos.filter((photo) => !removed.has(photoUrlKey(photo.url)));
    const existingKeys = new Set(filtered.map((photo) => photoUrlKey(photo.url)));
    const added = (entry.added ?? [])
        .filter((url) => url && !removed.has(photoUrlKey(url)))
        .filter((url) => {
        const canonical = photoUrlKey(url);
        if (existingKeys.has(canonical)) {
            return false;
        }
        existingKeys.add(canonical);
        return true;
    })
        .map((url) => ({ url }));
    if (added.length > 0) {
        filtered = [...filtered, ...added];
    }
    if (entry.order && entry.order.length > 0) {
        const byUrl = new Map(filtered.map((photo) => [photoUrlKey(photo.url), photo]));
        const ordered = [];
        const seen = new Set();
        for (const url of entry.order) {
            const canonical = photoUrlKey(url);
            const photo = byUrl.get(canonical);
            if (photo && !seen.has(canonical)) {
                ordered.push(photo);
                seen.add(canonical);
            }
        }
        for (const photo of filtered) {
            const canonical = photoUrlKey(photo.url);
            if (!seen.has(canonical)) {
                ordered.push(photo);
            }
        }
        filtered = ordered;
    }
    return filtered;
}
function applyUsablePhotoFilters(urls) {
    return (0, display_utils_1.filterUsablePhotoUrls)(urls);
}
