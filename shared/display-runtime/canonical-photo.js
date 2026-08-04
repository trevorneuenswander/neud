"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLocalOnlyPhotoUrl = isLocalOnlyPhotoUrl;
exports.isHostedAccessiblePhotoUrl = isHostedAccessiblePhotoUrl;
exports.isLocalDisplayPhotoUrl = isLocalDisplayPhotoUrl;
exports.normalizeCanonicalPhotoInput = normalizeCanonicalPhotoInput;
exports.normalizeCanonicalPhotoList = normalizeCanonicalPhotoList;
exports.resolvePhotoUrlsForLocalDisplay = resolvePhotoUrlsForLocalDisplay;
exports.resolvePhotoUrlsForHostedDisplay = resolvePhotoUrlsForHostedDisplay;
exports.summarizeCanonicalPhotoSources = summarizeCanonicalPhotoSources;
const LOCAL_HOST_PATTERN = /^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost)(?::\d+)?/i;
const FILE_SCHEME_PATTERN = /^file:/i;
const WINDOWS_PATH_PATTERN = /^[a-zA-Z]:\\|^\\\\/;
function trimString(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
}
function stripCredentials(url) {
    return url.replace(/\/\/[^/@]+@[^/]+\//g, "//");
}
function isLocalOnlyPhotoUrl(url) {
    const trimmed = stripCredentials(url.trim());
    if (!trimmed) {
        return false;
    }
    if (FILE_SCHEME_PATTERN.test(trimmed) || WINDOWS_PATH_PATTERN.test(trimmed)) {
        return true;
    }
    if (LOCAL_HOST_PATTERN.test(trimmed)) {
        return true;
    }
    if (trimmed.includes("/api/offline-assets/")) {
        return true;
    }
    if (/^photos\//i.test(trimmed) || /^images\//i.test(trimmed)) {
        return true;
    }
    return false;
}
function isHostedAccessiblePhotoUrl(url) {
    const trimmed = stripCredentials(url.trim());
    if (!trimmed) {
        return false;
    }
    if (!/^https:\/\//i.test(trimmed)) {
        return false;
    }
    return !isLocalOnlyPhotoUrl(trimmed);
}
function isLocalDisplayPhotoUrl(url) {
    const trimmed = stripCredentials(url.trim());
    if (!trimmed) {
        return false;
    }
    if (isLocalOnlyPhotoUrl(trimmed)) {
        return true;
    }
    return /^https?:\/\//i.test(trimmed);
}
function normalizeCanonicalPhotoInput(entry) {
    if (typeof entry === "string") {
        const url = trimString(entry);
        if (!url) {
            return null;
        }
        if (isLocalOnlyPhotoUrl(url)) {
            return { localUrl: url };
        }
        if (isHostedAccessiblePhotoUrl(url)) {
            return { remoteUrl: url, originalUrl: url };
        }
        return null;
    }
    if (!entry || typeof entry !== "object") {
        return null;
    }
    const localUrl = trimString(entry.localUrl);
    const remoteUrl = trimString(entry.remoteUrl ?? entry.originalUrl);
    const originalUrl = trimString(entry.originalUrl ?? entry.remoteUrl);
    const filename = trimString(entry.filename);
    const photo = {};
    if (localUrl && isLocalDisplayPhotoUrl(localUrl)) {
        photo.localUrl = localUrl;
    }
    if (remoteUrl && isHostedAccessiblePhotoUrl(remoteUrl)) {
        photo.remoteUrl = remoteUrl;
    }
    if (originalUrl && isHostedAccessiblePhotoUrl(originalUrl)) {
        photo.originalUrl = originalUrl;
    }
    if (filename) {
        photo.filename = filename;
    }
    return Object.keys(photo).length > 0 ? photo : null;
}
function normalizeCanonicalPhotoList(photos) {
    if (!Array.isArray(photos)) {
        return [];
    }
    const ordered = [];
    const seen = new Set();
    for (const entry of photos) {
        const normalized = typeof entry === "string" || (entry && typeof entry === "object")
            ? normalizeCanonicalPhotoInput(entry)
            : null;
        if (!normalized) {
            continue;
        }
        const key = typeof normalized === "object"
            ? [
                normalized.localUrl ?? "",
                normalized.remoteUrl ?? "",
                normalized.originalUrl ?? "",
                normalized.filename ?? "",
            ].join("|")
            : normalized;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        ordered.push(normalized);
    }
    return ordered;
}
function resolvePhotoUrlsForLocalDisplay(photos) {
    const ordered = [];
    const seen = new Set();
    for (const entry of normalizeCanonicalPhotoList(photos)) {
        let url = null;
        if (typeof entry === "string") {
            url = isLocalDisplayPhotoUrl(entry) ? entry : null;
        }
        else {
            url =
                (entry.localUrl && isLocalDisplayPhotoUrl(entry.localUrl) ? entry.localUrl : null) ??
                    (entry.remoteUrl && isHostedAccessiblePhotoUrl(entry.remoteUrl) ? entry.remoteUrl : null) ??
                    (entry.originalUrl && isHostedAccessiblePhotoUrl(entry.originalUrl)
                        ? entry.originalUrl
                        : null);
        }
        if (!url || seen.has(url)) {
            continue;
        }
        seen.add(url);
        ordered.push(stripCredentials(url));
    }
    return ordered;
}
function resolvePhotoUrlsForHostedDisplay(photos) {
    const ordered = [];
    const seen = new Set();
    for (const entry of normalizeCanonicalPhotoList(photos)) {
        let url = null;
        if (typeof entry === "string") {
            url = isHostedAccessiblePhotoUrl(entry) ? entry : null;
        }
        else {
            url =
                (entry.remoteUrl && isHostedAccessiblePhotoUrl(entry.remoteUrl) ? entry.remoteUrl : null) ??
                    (entry.originalUrl && isHostedAccessiblePhotoUrl(entry.originalUrl)
                        ? entry.originalUrl
                        : null);
        }
        if (!url || seen.has(url)) {
            continue;
        }
        seen.add(url);
        ordered.push(stripCredentials(url));
    }
    return ordered;
}
function summarizeCanonicalPhotoSources(photos) {
    let localCount = 0;
    let remoteCount = 0;
    let mixedCount = 0;
    let rejectedLocalOnlyCount = 0;
    for (const entry of normalizeCanonicalPhotoList(photos)) {
        if (typeof entry === "string") {
            if (isHostedAccessiblePhotoUrl(entry)) {
                remoteCount += 1;
            }
            else if (isLocalOnlyPhotoUrl(entry)) {
                localCount += 1;
                rejectedLocalOnlyCount += 1;
            }
            continue;
        }
        const hasLocal = Boolean(entry.localUrl);
        const hasRemote = Boolean(entry.remoteUrl || entry.originalUrl);
        if (hasLocal && hasRemote) {
            mixedCount += 1;
        }
        else if (hasLocal) {
            localCount += 1;
            rejectedLocalOnlyCount += 1;
        }
        else if (hasRemote) {
            remoteCount += 1;
        }
    }
    return { localCount, remoteCount, mixedCount, rejectedLocalOnlyCount };
}
