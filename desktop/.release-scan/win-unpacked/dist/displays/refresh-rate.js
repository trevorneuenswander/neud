"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_DISPLAY_REFRESH_RATE_MS = exports.DISPLAY_REFRESH_RATE_OPTIONS = exports.DEFAULT_DISPLAY_REFRESH_RATE_MS = void 0;
exports.isAllowedDisplayRefreshRateMs = isAllowedDisplayRefreshRateMs;
exports.normalizeDisplayRefreshRateMs = normalizeDisplayRefreshRateMs;
exports.formatDisplayRefreshRateLabel = formatDisplayRefreshRateLabel;
exports.DEFAULT_DISPLAY_REFRESH_RATE_MS = 5000;
exports.DISPLAY_REFRESH_RATE_OPTIONS = [
    { label: "1s", valueMs: 1000 },
    { label: "2.5s", valueMs: 2500 },
    { label: "5s", valueMs: 5000 },
    { label: "10s", valueMs: 10000 },
    { label: "30s", valueMs: 30000 },
    { label: "60s", valueMs: 60000 },
];
exports.ALLOWED_DISPLAY_REFRESH_RATE_MS = exports.DISPLAY_REFRESH_RATE_OPTIONS.map((option) => option.valueMs);
function isAllowedDisplayRefreshRateMs(refreshRateMs) {
    return exports.ALLOWED_DISPLAY_REFRESH_RATE_MS.includes(refreshRateMs);
}
function normalizeDisplayRefreshRateMs(refreshRateMs) {
    if (typeof refreshRateMs === "number" &&
        isAllowedDisplayRefreshRateMs(refreshRateMs)) {
        return refreshRateMs;
    }
    return exports.DEFAULT_DISPLAY_REFRESH_RATE_MS;
}
function formatDisplayRefreshRateLabel(refreshRateMs) {
    const option = exports.DISPLAY_REFRESH_RATE_OPTIONS.find((entry) => entry.valueMs === refreshRateMs);
    return option?.label ?? `${Math.round(refreshRateMs / 1000)}s`;
}
