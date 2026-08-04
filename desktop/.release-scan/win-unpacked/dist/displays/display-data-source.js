"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISPLAY_DATA_SOURCE_OPTIONS = exports.DISPLAY_DATA_SOURCE_SETTING_KEY = void 0;
exports.isDisplayDataSource = isDisplayDataSource;
exports.normalizeDisplayDataSource = normalizeDisplayDataSource;
exports.displayDataSourceLabel = displayDataSourceLabel;
exports.DISPLAY_DATA_SOURCE_SETTING_KEY = "displayDataSource";
exports.DISPLAY_DATA_SOURCE_OPTIONS = [
    { value: "webpage-scraper", label: "Webpage Scraper" },
    { value: "local-controller", label: "Local Controller" },
];
function isDisplayDataSource(value) {
    return value === "webpage-scraper" || value === "local-controller";
}
const LEGACY_DISPLAY_DATA_SOURCE_MAP = {
    manual: "local-controller",
    automatic: "webpage-scraper",
    scraper: "webpage-scraper",
    controller: "local-controller",
};
function normalizeDisplayDataSource(value) {
    if (isDisplayDataSource(value)) {
        return value;
    }
    if (typeof value === "string") {
        const mapped = LEGACY_DISPLAY_DATA_SOURCE_MAP[value.trim().toLowerCase()];
        if (mapped) {
            return mapped;
        }
    }
    return "webpage-scraper";
}
function displayDataSourceLabel(source) {
    return (exports.DISPLAY_DATA_SOURCE_OPTIONS.find((option) => option.value === source)?.label ??
        source);
}
