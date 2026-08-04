"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEPRECATED_ACTIVITY_TYPES = void 0;
exports.isDeprecatedActivityType = isDeprecatedActivityType;
exports.filterDeprecatedActivityEntries = filterDeprecatedActivityEntries;
exports.DEPRECATED_ACTIVITY_TYPES = new Set([
    "controller.lot-updated",
    "controller.bid-updated",
    "display.fullscreen",
    "display.fullscreen-opened",
    "offline.export.failed",
    "offline.export.adapter-resolved",
]);
function isDeprecatedActivityType(type) {
    return exports.DEPRECATED_ACTIVITY_TYPES.has(type);
}
function filterDeprecatedActivityEntries(entries) {
    return entries.filter((entry) => !isDeprecatedActivityType(entry.type));
}
