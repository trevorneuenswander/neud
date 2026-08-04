"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXPORT_SESSION_MESSAGES = exports.ExportSessionError = void 0;
exports.mapExportSessionError = mapExportSessionError;
exports.isAuthenticatedSessionState = isAuthenticatedSessionState;
class ExportSessionError extends Error {
    diagnostics;
    code;
    constructor(code, message, diagnostics) {
        super(message);
        this.diagnostics = diagnostics;
        this.name = "ExportSessionError";
        this.code = code;
    }
}
exports.ExportSessionError = ExportSessionError;
exports.EXPORT_SESSION_MESSAGES = {
    scraperStopped: "Start the Webpage Scraper before downloading the Current Webpage.",
    sessionTimeout: "The Webpage Scraper started, but its authenticated auction session did not become ready. Check the Execution Log and try again.",
    browserDisconnected: "The auction browser disconnected before the download began. Restart the Webpage Scraper and try again.",
    authenticationLost: "The auction session is no longer authenticated. Restart the Webpage Scraper and try again.",
    workerUnavailable: "No active export-capable worker was found for this project.",
};
function mapExportSessionError(error) {
    if (error instanceof ExportSessionError) {
        return error;
    }
    const message = error instanceof Error ? error.message : String(error ?? "Export failed.");
    if (/Start the Webpage Scraper before downloading/i.test(message)) {
        return new ExportSessionError("scraper-stopped", message);
    }
    if (/authenticated auction session did not become ready/i.test(message)) {
        return new ExportSessionError("session-timeout", message);
    }
    if (/browser disconnected/i.test(message)) {
        return new ExportSessionError("browser-disconnected", message);
    }
    if (/no longer authenticated/i.test(message)) {
        return new ExportSessionError("authentication-lost", message);
    }
    if (/export-capable worker/i.test(message)) {
        return new ExportSessionError("worker-mismatch", message);
    }
    if (/Start the Webpage Scraper and try again/i.test(message)) {
        return new ExportSessionError("scraper-stopped", exports.EXPORT_SESSION_MESSAGES.scraperStopped);
    }
    if (/browser session is unavailable/i.test(message)) {
        return new ExportSessionError("worker-unavailable", exports.EXPORT_SESSION_MESSAGES.scraperStopped);
    }
    return new ExportSessionError("worker-unavailable", message);
}
function isAuthenticatedSessionState(state) {
    return state === "ready" || state === "authenticating";
}
