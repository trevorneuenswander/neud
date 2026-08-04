"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISPLAY_SLUG_PATTERN = exports.PLACEHOLDER_URL_PATTERN = void 0;
exports.isPlaceholderLotImage = isPlaceholderLotImage;
exports.isUsablePhotoUrl = isUsablePhotoUrl;
exports.filterUsablePhotoUrls = filterUsablePhotoUrls;
exports.generateDisplaySlugFromName = generateDisplaySlugFromName;
exports.PLACEHOLDER_URL_PATTERN = /logo|icon|avatar|badge|spinner|placeholder|favicon|1x1|pixel|no-image|noimage|missing|pip/i;
function isPlaceholderLotImage(image) {
    if (!image)
        return true;
    if (typeof image === "object" && image.isPlaceholder === true) {
        return true;
    }
    const url = typeof image === "string"
        ? image
        : image.url ?? image.sourceUrl ?? image.displayUrl ?? image.relativePath ?? "";
    if (!url || typeof url !== "string")
        return true;
    const trimmed = url.trim();
    if (!trimmed)
        return true;
    if (exports.PLACEHOLDER_URL_PATTERN.test(trimmed))
        return true;
    if (/no[-_]?photo|default[-_]?image|coming[-_]?soon/i.test(trimmed))
        return true;
    return false;
}
function isUsablePhotoUrl(url) {
    if (!url || typeof url !== "string")
        return false;
    const trimmed = url.trim();
    if (!trimmed)
        return false;
    if (isPlaceholderLotImage(trimmed))
        return false;
    return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/api/offline-assets/");
}
function filterUsablePhotoUrls(urls) {
    const ordered = [];
    const seen = new Set();
    for (const url of urls) {
        if (!isUsablePhotoUrl(url) || seen.has(url))
            continue;
        seen.add(url);
        ordered.push(url);
    }
    return ordered;
}
function generateDisplaySlugFromName(name) {
    const slug = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
    return slug || "display";
}
exports.DISPLAY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
