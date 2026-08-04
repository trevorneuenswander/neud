"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeCanonicalProjectData = sanitizeCanonicalProjectData;
const LOT_ROW_KEYS = new Set(["lot", "title", "price", "status", "editHref", "editUrl"]);
const LAST_SOLD_KEYS = new Set(["lot", "title", "price", "editUrl", "editHref"]);
const CURRENT_KEYS = new Set([
    "lot",
    "title",
    "year",
    "reserveStatus",
    "biddingPrice",
    "price",
    "status",
    "photos",
    "imageUrl",
    "editHref",
    "editUrl",
]);
const AUCTION_DISPLAY_KEYS = new Set([
    "lot",
    "title",
    "year",
    "reserveStatus",
    "biddingPrice",
    "currencies",
    "photos",
    "pylon",
    "ticker",
]);
const PYLON_KEYS = new Set([
    "lot",
    "title",
    "year",
    "reserveStatus",
    "biddingPrice",
    "currencies",
    "photos",
]);
const TICKER_KEYS = new Set(["next"]);
const SECRET_KEY_PATTERN = /(password|passwd|secret|token|cookie|session|authorization|credential|service[_-]?role|api[_-]?key|refresh[_-]?token|access[_-]?token|email|phone|contact)/i;
const FILESYSTEM_PATH_PATTERN = /(?:^[a-zA-Z]:\\|^\\\\|^\/(?:Users|home|var|tmp|etc|opt|Volumes)\/)|(?:\\Users\\)|(?:\/Users\/)/;
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function sanitizeString(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    if (FILESYSTEM_PATH_PATTERN.test(trimmed)) {
        return null;
    }
    if (/@/.test(trimmed) && /\.[a-z]{2,}$/i.test(trimmed.split("@").pop() ?? "")) {
        return null;
    }
    return trimmed;
}
function sanitizeAllowedRecord(value, allowedKeys) {
    if (!isRecord(value)) {
        return null;
    }
    const output = {};
    for (const [key, entry] of Object.entries(value)) {
        if (SECRET_KEY_PATTERN.test(key)) {
            continue;
        }
        if (!allowedKeys.has(key)) {
            continue;
        }
        if (key === "photos" || key === "currencies") {
            if (!Array.isArray(entry)) {
                continue;
            }
            const sanitizedArray = entry
                .map((item) => sanitizeString(item))
                .filter((item) => item !== null);
            output[key] = sanitizedArray;
            continue;
        }
        if (key === "pylon" && isRecord(entry)) {
            const pylon = sanitizeAllowedRecord(entry, PYLON_KEYS);
            if (pylon) {
                output[key] = pylon;
            }
            continue;
        }
        if (key === "ticker" && isRecord(entry)) {
            const ticker = sanitizeAllowedRecord(entry, TICKER_KEYS);
            if (ticker && Array.isArray(ticker.next)) {
                output[key] = {
                    next: ticker.next
                        .map((row) => sanitizeAllowedRecord(row, LOT_ROW_KEYS))
                        .filter((row) => row !== null),
                };
            }
            continue;
        }
        if (typeof entry === "string") {
            const sanitized = sanitizeString(entry);
            if (sanitized !== null) {
                output[key] = sanitized;
            }
            continue;
        }
        if (typeof entry === "number" && Number.isFinite(entry)) {
            output[key] = entry;
        }
    }
    return Object.keys(output).length > 0 ? output : null;
}
function sanitizeLotRows(rows) {
    if (!Array.isArray(rows)) {
        return [];
    }
    return rows
        .map((row) => sanitizeAllowedRecord(row, LOT_ROW_KEYS))
        .filter((row) => row !== null);
}
function sanitizeCanonicalProjectData(input) {
    return {
        prev: sanitizeAllowedRecord(input.prev, CURRENT_KEYS),
        current: sanitizeAllowedRecord(input.current, CURRENT_KEYS),
        next: sanitizeLotRows(input.next),
        lots: sanitizeLotRows(input.lots),
        lastSold: sanitizeAllowedRecord(input.lastSold, LAST_SOLD_KEYS),
        auctionDisplay: sanitizeAllowedRecord(input.auctionDisplay, AUCTION_DISPLAY_KEYS),
        updatedAt: sanitizeString(input.updatedAt) ?? new Date(0).toISOString(),
        dataSource: input.dataSource,
    };
}
