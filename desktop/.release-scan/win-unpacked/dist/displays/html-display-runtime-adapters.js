"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_PYLON_RUNTIME_ADAPTER_KEY = exports.LEGACY_TICKER_RUNTIME_ADAPTER_KEY = void 0;
exports.resolveDisplayRuntimeAdapterKey = resolveDisplayRuntimeAdapterKey;
exports.applyHtmlDisplayRuntimeAdapters = applyHtmlDisplayRuntimeAdapters;
exports.listHtmlDisplayRuntimeAdapters = listHtmlDisplayRuntimeAdapters;
exports.readLegacyTickerAdapterScriptForTests = readLegacyTickerAdapterScriptForTests;
exports.readLegacyPylonAdapterScriptForTests = readLegacyPylonAdapterScriptForTests;
exports.hasLegacyTickerAdapterMarkers = hasLegacyTickerAdapterMarkers;
exports.hasLegacyPylonAdapterMarkers = hasLegacyPylonAdapterMarkers;
const broad_arrow_phase_1 = require("../bag/broad-arrow-phase");
const legacy_display_v2_transform_1 = require("./legacy-display-v2-transform");
exports.LEGACY_TICKER_RUNTIME_ADAPTER_KEY = "broad-arrow-legacy-ticker";
exports.LEGACY_PYLON_RUNTIME_ADAPTER_KEY = "broad-arrow-legacy-pylon";
function resolveDisplayRuntimeAdapterKey(display) {
    const configured = display.runtimeAdapterKey ?? display.settings?.runtimeAdapterKey;
    if (typeof configured === "string" && configured.trim()) {
        return configured.trim();
    }
    if ((display.slug === "legacy-ticker" || display.displayKey === "legacy-ticker") &&
        (0, broad_arrow_phase_1.isBroadArrowCanonicalProject)({ slug: display.projectSlug })) {
        return exports.LEGACY_TICKER_RUNTIME_ADAPTER_KEY;
    }
    if ((display.slug === "legacy-pylon" || display.displayKey === "legacy-pylon") &&
        (0, broad_arrow_phase_1.isBroadArrowCanonicalProject)({ slug: display.projectSlug })) {
        return exports.LEGACY_PYLON_RUNTIME_ADAPTER_KEY;
    }
    return null;
}
const HTML_DISPLAY_RUNTIME_ADAPTERS = [
    {
        id: exports.LEGACY_TICKER_RUNTIME_ADAPTER_KEY,
        appliesTo: (display) => resolveDisplayRuntimeAdapterKey(display) === exports.LEGACY_TICKER_RUNTIME_ADAPTER_KEY,
        transformServedHtml: (html) => (0, legacy_display_v2_transform_1.transformLegacyTickerHtmlForServing)(html),
    },
    {
        id: exports.LEGACY_PYLON_RUNTIME_ADAPTER_KEY,
        appliesTo: (display) => resolveDisplayRuntimeAdapterKey(display) === exports.LEGACY_PYLON_RUNTIME_ADAPTER_KEY,
        transformServedHtml: (html) => (0, legacy_display_v2_transform_1.transformLegacyPylonHtmlForServing)(html),
    },
];
function applyHtmlDisplayRuntimeAdapters(html, display) {
    let result = html;
    for (const adapter of HTML_DISPLAY_RUNTIME_ADAPTERS) {
        if (adapter.appliesTo(display)) {
            result = adapter.transformServedHtml(result);
        }
    }
    return result;
}
function listHtmlDisplayRuntimeAdapters() {
    return [...HTML_DISPLAY_RUNTIME_ADAPTERS];
}
function readLegacyTickerAdapterScriptForTests() {
    return (0, legacy_display_v2_transform_1.readLegacyTickerLiveBridgeScript)();
}
function readLegacyPylonAdapterScriptForTests() {
    return (0, legacy_display_v2_transform_1.readLegacyPylonLiveBridgeScript)();
}
function hasLegacyTickerAdapterMarkers(html) {
    return (0, legacy_display_v2_transform_1.hasEmbeddedLegacyTickerBridge)(html);
}
function hasLegacyPylonAdapterMarkers(html) {
    return (0, legacy_display_v2_transform_1.hasEmbeddedLegacyPylonBridge)(html);
}
