"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeLeadingActorFromDescription = removeLeadingActorFromDescription;
exports.getCleanActivityDescription = getCleanActivityDescription;
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function capitalizeFirstCharacter(value) {
    if (!value)
        return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
}
function removeLeadingActorFromDescription(description, actorDisplayName) {
    const trimmedMessage = description.trim();
    const trimmedActor = (actorDisplayName ?? "").trim();
    if (!trimmedMessage) {
        return trimmedMessage;
    }
    if (!trimmedActor) {
        return capitalizeFirstCharacter(trimmedMessage);
    }
    const escapedActor = escapeRegExp(trimmedActor);
    const withoutActor = trimmedMessage
        .replace(new RegExp(`^${escapedActor}(?:\\s*(?:[—–-]|:)\\s*|\\s+)`, "i"), "")
        .trim();
    return capitalizeFirstCharacter(withoutActor || trimmedMessage);
}
function getCleanActivityDescription(description, actorDisplayName) {
    return removeLeadingActorFromDescription(description, actorDisplayName);
}
