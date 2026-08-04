"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverLotPhotoUrls = discoverLotPhotoUrls;
exports.mergeSnapshotPhotoUrls = mergeSnapshotPhotoUrls;
const display_utils_1 = require("../displays/display-utils");
const project_scraper_auth_1 = require("./project-scraper-auth");
const EXPORT_BROWSER_UNAVAILABLE = "The auction browser session is unavailable. Start the Webpage Scraper and try again.";
function readLotNumber(lot) {
    if (!lot)
        return "";
    const raw = lot.lotNumber ?? lot.lot ?? "";
    return raw.replace(/^lot\s+/i, "").trim();
}
function resolveEditUrl(lot, auctionBaseUrl) {
    const href = lot.editUrl ?? lot.editHref ?? lot.detailUrl ?? null;
    if (!href)
        return null;
    try {
        return new URL(href, auctionBaseUrl).toString();
    }
    catch {
        return null;
    }
}
function parseWorkerExportResult(result) {
    const detailsByLot = new Map();
    const rawDetails = result.detailsByLot && typeof result.detailsByLot === "object"
        ? result.detailsByLot
        : {};
    for (const [lotNumber, detail] of Object.entries(rawDetails)) {
        if (!detail || typeof detail !== "object")
            continue;
        detailsByLot.set(lotNumber, {
            sold: detail.sold,
            currentPrice: detail.currentPrice,
            photoUrls: Array.isArray(detail.photoUrls) ? detail.photoUrls : [],
            photos: Array.isArray(detail.photos) ? detail.photos : undefined,
            detailUrl: typeof detail.detailUrl === "string" ? detail.detailUrl : "",
            reserveStatus: typeof detail.reserveStatus === "string" ? detail.reserveStatus : undefined,
            diagnostics: detail.diagnostics && typeof detail.diagnostics === "object"
                ? detail.diagnostics
                : undefined,
        });
    }
    const rawPhotoDownloads = result.photoDownloads && typeof result.photoDownloads === "object"
        ? result.photoDownloads
        : null;
    const rawComprehensive = result.comprehensiveDiagnostics && typeof result.comprehensiveDiagnostics === "object"
        ? result.comprehensiveDiagnostics
        : null;
    const rawLotDiagnostics = Array.isArray(rawComprehensive?.lotDiagnostics)
        ? rawComprehensive.lotDiagnostics
        : [];
    const lotDiagnostics = rawLotDiagnostics.map((entry) => ({
        lotNumber: typeof entry.lotNumber === "string" ? entry.lotNumber : "",
        photoSelectorMatches: typeof entry.photoSelectorMatches === "number" ? entry.photoSelectorMatches : 0,
        photoUrlsExtracted: typeof entry.photoUrlsExtracted === "number" ? entry.photoUrlsExtracted : 0,
        photoDownloadsQueued: typeof entry.photoDownloadAttempts === "number" ? entry.photoDownloadAttempts : 0,
        photoDownloadResponses: typeof entry.photoFilesWritten === "number" ? entry.photoFilesWritten : 0,
        photoFilesWritten: typeof entry.photoFilesWritten === "number" ? entry.photoFilesWritten : 0,
        photoFilesCopiedToFinalPackage: typeof entry.photoFilesWritten === "number" ? entry.photoFilesWritten : 0,
        photoFilesPresentAfterFinalize: typeof entry.photoFilesWritten === "number" ? entry.photoFilesWritten : 0,
    }));
    const photoDownloadsQueued = typeof rawPhotoDownloads?.attempted === "number"
        ? rawPhotoDownloads.attempted
        : typeof rawComprehensive?.photoRequestsStarted === "number"
            ? rawComprehensive.photoRequestsStarted
            : 0;
    const photoDownloadsSucceeded = typeof rawPhotoDownloads?.succeeded === "number"
        ? rawPhotoDownloads.succeeded
        : typeof rawComprehensive?.photoResponsesReceived === "number"
            ? rawComprehensive.photoResponsesReceived
            : 0;
    const photoDownloadsFailed = Array.isArray(rawPhotoDownloads?.failed)
        ? rawPhotoDownloads.failed.length
        : 0;
    const photoFilesWritten = typeof rawComprehensive?.photoFilesWritten === "number"
        ? rawComprehensive.photoFilesWritten
        : photoDownloadsSucceeded;
    let lotsWithPhotos = 0;
    let totalPhotoUrls = 0;
    for (const detail of detailsByLot.values()) {
        const count = detail.photoUrls.length;
        if (count > 0) {
            lotsWithPhotos += 1;
            totalPhotoUrls += count;
        }
    }
    return {
        attempted: typeof result.attempted === "number" ? result.attempted : 0,
        succeeded: typeof result.succeeded === "number" ? result.succeeded : 0,
        failed: Array.isArray(result.failed) ? result.failed : [],
        detailsByLot,
        diagnostics: {
            lotsWithPhotos,
            totalPhotoUrls,
            photoDownloadsQueued,
            photoDownloadsSucceeded,
            photoDownloadsFailed,
            photoFilesWritten,
            photoFilesPresentAfterFinalize: photoFilesWritten,
            lotDiagnostics,
        },
    };
}
async function discoverLotPhotoUrls(input) {
    const detailsByLot = new Map();
    const failed = [];
    const emptyDiagnostics = {
        lotsWithPhotos: 0,
        totalPhotoUrls: 0,
        photoDownloadsQueued: 0,
        photoDownloadsSucceeded: 0,
        photoDownloadsFailed: 0,
        photoFilesWritten: 0,
        photoFilesPresentAfterFinalize: 0,
        lotDiagnostics: [],
    };
    if (!input.engineManager?.isEngineRunning(input.engineId)) {
        throw new Error(EXPORT_BROWSER_UNAVAILABLE);
    }
    const tasks = input.lots
        .map((lot) => {
        const lotNumber = readLotNumber(lot);
        const sourceEditUrl = lot.editHref ?? lot.editUrl ?? lot.detailUrl ?? null;
        const editUrl = resolveEditUrl(lot, input.auctionBaseUrl);
        if (!lotNumber || !editUrl)
            return null;
        return { lotNumber, editUrl, sourceEditUrl: sourceEditUrl ?? editUrl };
    })
        .filter((task) => Boolean(task));
    if (tasks.length === 0) {
        return {
            attempted: 0,
            succeeded: 0,
            failed,
            detailsByLot,
            diagnostics: emptyDiagnostics,
        };
    }
    const hasAuth = (0, project_scraper_auth_1.hasProjectScraperRunnableAuth)(input.credentials, input.paths, input.engineId) ||
        input.engineManager.hasAuthenticatedExportContext(input.engineId);
    if (!hasAuth) {
        throw new Error("Webpage Scraper credentials are required before downloading lot photos.");
    }
    try {
        const result = await input.engineManager.exportCurrentAuction(input.engineId, tasks, input.photoDownloadRoot);
        const parsed = parseWorkerExportResult(result);
        input.onProgress?.(`Collected photos for ${parsed.succeeded} of ${parsed.attempted} lots.`, parsed.attempted, parsed.attempted);
        return parsed;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : EXPORT_BROWSER_UNAVAILABLE;
        throw new Error(message.includes("unavailable") ? message : EXPORT_BROWSER_UNAVAILABLE);
    }
}
function mergeSnapshotPhotoUrls(lot) {
    const ordered = [];
    const seen = new Set();
    const add = (value) => {
        if (!value)
            return;
        const resolved = typeof value === "string"
            ? value
            : value.sourceUrl ?? value.displayUrl ?? null;
        if (!resolved || typeof resolved !== "string")
            return;
        if (!(0, display_utils_1.isUsablePhotoUrl)(resolved) || seen.has(resolved))
            return;
        seen.add(resolved);
        ordered.push(resolved);
    };
    if (Array.isArray(lot.photoUrls)) {
        for (const url of lot.photoUrls)
            add(url);
    }
    if (Array.isArray(lot.photos)) {
        for (const photo of lot.photos)
            add(photo);
    }
    add(lot.imageUrl);
    return ordered;
}
