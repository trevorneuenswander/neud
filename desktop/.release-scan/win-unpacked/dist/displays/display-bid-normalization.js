"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISPLAY_NO_BID_LABEL = void 0;
exports.parseCanonicalBid = parseCanonicalBid;
exports.hasCanonicalBid = hasCanonicalBid;
exports.normalizeDisplayBid = normalizeDisplayBid;
exports.resolveCanonicalBidAmount = resolveCanonicalBidAmount;
const bag_manual_validation_1 = require("../bag/live-state/bag-manual-validation");
exports.DISPLAY_NO_BID_LABEL = "—";
const INVALID_BID_LABELS = new Set([
    "",
    "—",
    "-",
    "$",
    "$0",
    "$0.00",
    "0",
    "0.00",
    "null",
    "undefined",
    "no bid",
    "nan",
    "$nan",
]);
function parseCanonicalBid(value) {
    if (value == null) {
        return null;
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value) || value <= 0) {
            return null;
        }
        return Math.round(value);
    }
    const trimmed = String(value).trim();
    if (!trimmed) {
        return null;
    }
    const normalizedLabel = trimmed.toLowerCase();
    if (INVALID_BID_LABELS.has(normalizedLabel)) {
        return null;
    }
    if (/^\$?\s*0(?:\.00)?$/i.test(trimmed)) {
        return null;
    }
    if (/no\s*bid/i.test(trimmed)) {
        return null;
    }
    if (/nan/i.test(trimmed)) {
        return null;
    }
    const digitsOnly = trimmed.replace(/[$€£¥,\s]/g, "");
    if (!digitsOnly || !/^\d+(\.\d+)?$/.test(digitsOnly)) {
        return /\d/.test(trimmed) ? null : null;
    }
    const amount = Number(digitsOnly);
    if (!Number.isFinite(amount) || amount <= 0) {
        return null;
    }
    return Math.round(amount);
}
function hasCanonicalBid(value) {
    return parseCanonicalBid(value) != null;
}
function normalizeDisplayBid(value) {
    const numeric = parseCanonicalBid(value);
    if (numeric == null) {
        return exports.DISPLAY_NO_BID_LABEL;
    }
    return (0, bag_manual_validation_1.formatBidLabel)(numeric);
}
function resolveCanonicalBidAmount(input) {
    return (parseCanonicalBid(input.currentBid) ??
        parseCanonicalBid(input.currentBidLabel) ??
        parseCanonicalBid(input.biddingPrice));
}
