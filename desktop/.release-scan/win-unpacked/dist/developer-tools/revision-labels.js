"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_REVISION_CHANGE_NOTE_LENGTH = exports.MAX_REVISION_NAME_LENGTH = void 0;
exports.normalizeRevisionName = normalizeRevisionName;
exports.normalizeChangeNote = normalizeChangeNote;
exports.buildRevisionMessage = buildRevisionMessage;
exports.isGenericRevisionMessage = isGenericRevisionMessage;
exports.resolveRunningRuntimeFilePaths = resolveRunningRuntimeFilePaths;
const GENERIC_REVISION_MESSAGES = new Set([
    "Scraper code published",
    "Display code published",
    "Initial scraper seed",
    "Initial display seed",
    "Display created",
]);
exports.MAX_REVISION_NAME_LENGTH = 120;
exports.MAX_REVISION_CHANGE_NOTE_LENGTH = 500;
function normalizeRevisionName(value) {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) {
        return null;
    }
    return trimmed.slice(0, exports.MAX_REVISION_NAME_LENGTH);
}
function normalizeChangeNote(value) {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) {
        return null;
    }
    return trimmed.slice(0, exports.MAX_REVISION_CHANGE_NOTE_LENGTH);
}
function buildRevisionMessage(input) {
    const revisionName = normalizeRevisionName(input.revisionName);
    if (revisionName) {
        return revisionName;
    }
    return input.fallback;
}
function isGenericRevisionMessage(message) {
    const trimmed = message?.trim();
    if (!trimmed) {
        return true;
    }
    return GENERIC_REVISION_MESSAGES.has(trimmed) || trimmed.startsWith("Restored revision");
}
const BAG_ADAPTER_FILES = [
    "index.js",
    "engine-runtime.js",
    "adapters/registry.js",
    "adapters/bag-auction.js",
    "adapters/bag-auction-legacy-runtime.js",
    "adapters/bag-lot-detail-page.js",
    "adapters/bag-photo-download.js",
    "adapters/legacy-puppeteer-resolver.js",
    "adapters/webpage-scraper/browser.js",
    "browser/resolve-puppeteer-browser.js",
    "bag-login-flow.js",
    "bag-diagnostics.js",
    "bag-runtime-config.js",
    "local-client.js",
    "snapshots.js",
    "heartbeat.js",
    "commands.js",
    "config.js",
];
const GENERIC_ADAPTER_FILES = [
    "index.js",
    "engine-runtime.js",
    "adapters/registry.js",
    "adapters/generic-webpage.js",
    "adapters/webpage-scraper/browser.js",
    "browser/resolve-puppeteer-browser.js",
    "local-client.js",
    "snapshots.js",
    "heartbeat.js",
    "commands.js",
    "config.js",
];
function resolveRunningRuntimeFilePaths(adapterName) {
    const paths = adapterName === "bag-auction"
        ? BAG_ADAPTER_FILES
        : adapterName === "generic-webpage"
            ? GENERIC_ADAPTER_FILES
            : ["index.js", "engine-runtime.js", "adapters/registry.js"];
    return new Set(paths);
}
