"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MissingScraperCredentialsError = exports.CREDENTIAL_RESOLUTION_FAILED_LOG_MESSAGE = exports.BAG_EXPORT_CREDENTIALS_REQUIRED_MESSAGE = exports.MISSING_SCRAPER_CREDENTIALS_MESSAGE = void 0;
exports.isMissingScraperCredentialsError = isMissingScraperCredentialsError;
exports.resolveProjectWebpageScraperEngineId = resolveProjectWebpageScraperEngineId;
exports.getProjectWebpageScraperCredentials = getProjectWebpageScraperCredentials;
exports.getBroadArrowCredentialsForProject = getBroadArrowCredentialsForProject;
exports.resolveBroadArrowExportEngineId = resolveBroadArrowExportEngineId;
exports.hasProjectScraperRunnableAuth = hasProjectScraperRunnableAuth;
exports.canRunAuthenticatedComprehensiveExport = canRunAuthenticatedComprehensiveExport;
exports.assertComprehensiveExportAuthentication = assertComprehensiveExportAuthentication;
const engine_session_auth_1 = require("./engine-session-auth");
exports.MISSING_SCRAPER_CREDENTIALS_MESSAGE = "Webpage Scraper credentials are required before downloading the Current Webpage.";
exports.BAG_EXPORT_CREDENTIALS_REQUIRED_MESSAGE = "Auction credentials are required before downloading the Current Webpage.";
exports.CREDENTIAL_RESOLUTION_FAILED_LOG_MESSAGE = "Saved Webpage Scraper credentials could not be resolved for the downloader.";
class MissingScraperCredentialsError extends Error {
    code = "missing-scraper-credentials";
    constructor(message = exports.MISSING_SCRAPER_CREDENTIALS_MESSAGE) {
        super(message);
        this.name = "MissingScraperCredentialsError";
    }
}
exports.MissingScraperCredentialsError = MissingScraperCredentialsError;
function isMissingScraperCredentialsError(error) {
    return (error instanceof MissingScraperCredentialsError ||
        (error instanceof Error && error.message === exports.MISSING_SCRAPER_CREDENTIALS_MESSAGE));
}
function resolveProjectWebpageScraperEngineId(dataSources, projectId) {
    const engines = dataSources.listByProject(projectId);
    const webpageScraper = engines.find((engine) => engine.sourceType === "webpage-scraper" || engine.sourceKey === "webpage-scraper");
    return webpageScraper?.id ?? null;
}
function getProjectWebpageScraperCredentials(credentials, engineId) {
    return credentials.getCredentialsForWorker(engineId);
}
function getBroadArrowCredentialsForProject(input) {
    const engineId = resolveProjectWebpageScraperEngineId(input.dataSources, input.projectId);
    if (!engineId) {
        return null;
    }
    return getProjectWebpageScraperCredentials(input.credentials, engineId);
}
function resolveBroadArrowExportEngineId(input) {
    return resolveProjectWebpageScraperEngineId(input.dataSources, input.projectId);
}
function hasProjectScraperRunnableAuth(credentials, paths, engineId) {
    return credentials.hasRunnableAuth(engineId) || (0, engine_session_auth_1.hasPersistedSessionCookies)(paths, engineId);
}
function canRunAuthenticatedComprehensiveExport(input) {
    if (input.engineManager?.hasAuthenticatedExportContext(input.engineId)) {
        return true;
    }
    return hasProjectScraperRunnableAuth(input.credentials, input.paths, input.engineId);
}
function assertComprehensiveExportAuthentication(input) {
    if (canRunAuthenticatedComprehensiveExport(input)) {
        return;
    }
    throw new MissingScraperCredentialsError();
}
