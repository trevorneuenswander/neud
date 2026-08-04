"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCachedProfileTeamColumn = getCachedProfileTeamColumn;
exports.setCachedProfileTeamColumn = setCachedProfileTeamColumn;
exports.resetProfileSchemaCache = resetProfileSchemaCache;
exports.isMissingTeamColumnError = isMissingTeamColumnError;
let cachedProfileTeamColumn = null;
function getCachedProfileTeamColumn() {
    return cachedProfileTeamColumn;
}
function setCachedProfileTeamColumn(column) {
    cachedProfileTeamColumn = column;
    if (process.env.NODE_ENV !== "production") {
        console.info(`[identity-resolution] Profile schema mode: ${column === "company" ? "legacy-company" : "modern-team"}`);
    }
}
function resetProfileSchemaCache() {
    cachedProfileTeamColumn = null;
}
function isMissingTeamColumnError(message) {
    const normalized = message.toLowerCase();
    return normalized.includes("team") && normalized.includes("does not exist");
}
