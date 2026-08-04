"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveActivityActorName = resolveActivityActorName;
exports.formatActivityDescription = formatActivityDescription;
exports.formatUserActivityMessage = formatUserActivityMessage;
exports.formatSystemActivityMessage = formatSystemActivityMessage;
function resolveActivityActorName(actor) {
    const name = actor?.name?.trim();
    if (name)
        return name;
    return "System";
}
function formatActivityDescription(description) {
    const trimmed = description.trim();
    if (!trimmed)
        return trimmed;
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
/** @deprecated New events store clean descriptions; actor is stored separately. */
function formatUserActivityMessage(action, actor) {
    return formatActivityDescription(action);
}
function formatSystemActivityMessage(message) {
    return message;
}
