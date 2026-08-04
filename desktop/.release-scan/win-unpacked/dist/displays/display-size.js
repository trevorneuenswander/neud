"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISPLAY_SIZE_OPTIONS = exports.DEFAULT_DISPLAY_HEIGHT = exports.DEFAULT_DISPLAY_WIDTH = void 0;
exports.isAllowedDisplaySize = isAllowedDisplaySize;
exports.normalizeDisplaySize = normalizeDisplaySize;
exports.formatDisplaySizeLabel = formatDisplaySizeLabel;
exports.DEFAULT_DISPLAY_WIDTH = 1920;
exports.DEFAULT_DISPLAY_HEIGHT = 1080;
exports.DISPLAY_SIZE_OPTIONS = [
    { label: "1920x1080", width: 1920, height: 1080 },
    { label: "3840x2160", width: 3840, height: 2160 },
];
function isAllowedDisplaySize(width, height) {
    return exports.DISPLAY_SIZE_OPTIONS.some((option) => option.width === width && option.height === height);
}
function normalizeDisplaySize(width, height) {
    if (typeof width === "number" &&
        typeof height === "number" &&
        isAllowedDisplaySize(width, height)) {
        const label = exports.DISPLAY_SIZE_OPTIONS.find((option) => option.width === width && option.height === height)?.label ?? "1920x1080";
        return { displayWidth: width, displayHeight: height, label };
    }
    return {
        displayWidth: exports.DEFAULT_DISPLAY_WIDTH,
        displayHeight: exports.DEFAULT_DISPLAY_HEIGHT,
        label: "1920x1080",
    };
}
function formatDisplaySizeLabel(width, height) {
    return `${width}x${height}`;
}
