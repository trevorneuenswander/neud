"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.photoCanonicalKey = photoCanonicalKey;
exports.normalizeLotThumbnailPhotos = normalizeLotThumbnailPhotos;
exports.resolveLotPreviewPhotos = resolveLotPreviewPhotos;
exports.findLotInAuctionExport = findLotInAuctionExport;
const display_utils_1 = require("../displays/display-utils");
function readLotNumber(lot) {
    if (!lot)
        return "";
    const raw = lot.lotNumber ?? lot.lot ?? "";
    return raw.replace(/^lot\s+/i, "").trim();
}
function isUsableRemoteUrl(url) {
    return (0, display_utils_1.isUsablePhotoUrl)(url);
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
function photoCanonicalKey(photo, buildLocalAssetUrl) {
    if (typeof photo === "string") {
        if (photo.startsWith("photos/") || photo.startsWith("images/")) {
            return `local:${photo.replace(/\\/g, "/")}`;
        }
        const offlinePath = extractOfflineAssetPath(photo);
        if (offlinePath) {
            return `local:${offlinePath}`;
        }
        if (isUsableRemoteUrl(photo)) {
            return `remote:${photo.trim()}`;
        }
        return null;
    }
    if (typeof photo.relativePath === "string" && photo.relativePath.trim()) {
        return `local:${photo.relativePath.replace(/\\/g, "/")}`;
    }
    if (typeof photo.fileName === "string" && photo.fileName.trim()) {
        return `local:photos/${photo.fileName.replace(/\\/g, "/")}`;
    }
    if (typeof photo.displayUrl === "string") {
        const offlinePath = extractOfflineAssetPath(photo.displayUrl);
        if (offlinePath) {
            return `local:${offlinePath}`;
        }
        if (isUsableRemoteUrl(photo.displayUrl)) {
            return `remote:${photo.displayUrl}`;
        }
    }
    if (isUsableRemoteUrl(photo.sourceUrl)) {
        return `remote:${photo.sourceUrl}`;
    }
    if (typeof photo.relativePath === "string" && buildLocalAssetUrl) {
        const built = buildLocalAssetUrl(photo.relativePath);
        if (built) {
            const offlinePath = extractOfflineAssetPath(built);
            if (offlinePath) {
                return `local:${offlinePath}`;
            }
        }
    }
    return null;
}
function resolvePhotoReference(photo, buildLocalAssetUrl) {
    if (typeof photo === "string") {
        const offlinePath = extractOfflineAssetPath(photo);
        if (offlinePath) {
            return { localUrl: offlinePath };
        }
        if (photo.startsWith("photos/") || photo.startsWith("images/")) {
            return { localUrl: photo };
        }
        if (isUsableRemoteUrl(photo)) {
            return { remoteUrl: photo };
        }
        return {};
    }
    if (typeof photo.displayUrl === "string") {
        const offlinePath = extractOfflineAssetPath(photo.displayUrl);
        if (offlinePath) {
            return { localUrl: offlinePath };
        }
        if (/^https?:\/\//i.test(photo.displayUrl)) {
            return { remoteUrl: photo.displayUrl };
        }
    }
    const localPath = typeof photo.relativePath === "string" && photo.relativePath.trim()
        ? photo.relativePath.replace(/\\/g, "/")
        : undefined;
    const remoteUrl = isUsableRemoteUrl(photo.sourceUrl) ? photo.sourceUrl : undefined;
    return { localUrl: localPath, remoteUrl };
}
function normalizeLotThumbnailPhotos(lot, buildLocalAssetUrl) {
    return resolveLotPreviewPhotos(lot, buildLocalAssetUrl);
}
function resolveLotPreviewPhotos(lot, buildLocalAssetUrl) {
    if (!lot)
        return [];
    const lotNumber = readLotNumber(lot);
    const ordered = [];
    const seen = new Set();
    const pushPhoto = (url, source, index, canonical) => {
        const key = canonical ?? url;
        if (!url || seen.has(key))
            return;
        seen.add(key);
        ordered.push({
            url,
            source,
            alt: lotNumber ? `Lot ${lotNumber} photo ${index}` : `Lot photo ${index}`,
        });
    };
    const sources = [];
    if (Array.isArray(lot.photos) && lot.photos.length > 0) {
        sources.push(...lot.photos);
    }
    else if (Array.isArray(lot.photoUrls) && lot.photoUrls.length > 0) {
        sources.push(...lot.photoUrls);
    }
    let index = 1;
    for (const entry of sources) {
        const canonical = photoCanonicalKey(entry, buildLocalAssetUrl);
        if (canonical && seen.has(canonical)) {
            continue;
        }
        const resolved = resolvePhotoReference(entry, buildLocalAssetUrl);
        if (resolved.localUrl) {
            const displayUrl = resolved.localUrl.startsWith("/api/offline-assets/") || /^https?:\/\//i.test(resolved.localUrl)
                ? resolved.localUrl
                : buildLocalAssetUrl?.(resolved.localUrl) ?? null;
            if (displayUrl) {
                pushPhoto(displayUrl, "local", index, canonical);
                index += 1;
                continue;
            }
        }
        if (resolved.remoteUrl) {
            pushPhoto(resolved.remoteUrl, "remote", index, canonical);
            index += 1;
        }
    }
    if (ordered.length === 0 && isUsableRemoteUrl(lot.imageUrl)) {
        const canonical = `remote:${lot.imageUrl}`;
        if (!seen.has(canonical)) {
            pushPhoto(lot.imageUrl, "remote", index, canonical);
        }
    }
    return ordered;
}
function findLotInAuctionExport(lots, lotNumber) {
    if (!lots || !lotNumber.trim())
        return null;
    const normalized = lotNumber.replace(/^lot\s+/i, "").trim().toLowerCase();
    return (lots.find((lot) => readLotNumber(lot).toLowerCase() === normalized) ??
        lots.find((lot) => readLotNumber(lot).toLowerCase().includes(normalized)) ??
        null);
}
