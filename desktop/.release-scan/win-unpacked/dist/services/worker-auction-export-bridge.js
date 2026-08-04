"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WORKER_EXPORT_ERRORS = void 0;
exports.buildWorkerExportTasks = buildWorkerExportTasks;
exports.mergeWorkerExportIntoExportPayload = mergeWorkerExportIntoExportPayload;
exports.mapWorkerExportError = mapWorkerExportError;
const path_1 = __importDefault(require("path"));
const offline_auction_types_1 = require("./offline-auction-types");
const bag_edit_url_resolution_1 = require("./bag-edit-url-resolution");
const auction_photo_storage_1 = require("./auction-photo-storage");
const reserve_status_1 = require("../bag/reserve-status");
exports.WORKER_EXPORT_ERRORS = {
    SCRAPER_STOPPED: "Start the Webpage Scraper before downloading the Current Webpage.",
    NO_SNAPSHOT: "No Webpage Scraper data is available yet. Start the scraper and wait for a successful poll before downloading.",
    WORKER_MISSING: "The active Webpage Scraper worker could not be found. Restart the scraper and try again.",
    BROWSER_DISCONNECTED: "The Webpage Scraper browser disconnected. Restart the scraper and try again.",
    AUTH_LOST: "The running Webpage Scraper is no longer authenticated. Restart the scraper and try again.",
};
function readLotNumber(lot) {
    if (!lot)
        return "";
    const raw = lot.lotNumber ?? lot.lot ?? "";
    return raw.replace(/^lot\s+/i, "").trim();
}
function cloneLot(lot) {
    return JSON.parse(JSON.stringify(lot));
}
function buildAssetUrl(localApiBaseUrl, packageId, relativePath) {
    const encoded = relativePath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    return `${localApiBaseUrl}/api/offline-assets/${encodeURIComponent(packageId)}/${encoded}`;
}
function buildWorkerExportTasks(snapshot, dataSources, engineId) {
    const auctionOrigin = (0, bag_edit_url_resolution_1.resolveAuctionOriginForExport)({ snapshot, dataSources, engineId });
    const lots = Array.isArray(snapshot.lots) ? snapshot.lots : [];
    return lots
        .map((lot) => {
        const lotNumber = readLotNumber(lot);
        const { editUrl } = (0, bag_edit_url_resolution_1.resolveLotEditUrlFromLot)(lot, auctionOrigin);
        const sourceEditUrl = (typeof lot.editHref === "string" && lot.editHref) ||
            (typeof lot.editUrl === "string" && lot.editUrl) ||
            editUrl;
        return {
            lotNumber,
            editUrl: editUrl ?? "",
            sourceEditUrl,
        };
    })
        .filter((task) => task.lotNumber && task.editUrl);
}
function mergeWorkerExportIntoExportPayload(input) {
    const exportedAt = new Date().toISOString();
    const sourceLots = Array.isArray(input.snapshot.lots)
        ? input.snapshot.lots
        : [];
    const exportLots = sourceLots.map(cloneLot);
    const detailsByLot = input.workerResult.detailsByLot ?? {};
    const packageId = path_1.default.basename(input.packageDir).replace(/\.partial$/i, "");
    let photosDownloaded = 0;
    let photosFailed = input.workerResult.photoDownloads?.failed?.length ?? 0;
    let photoUrlsFound = 0;
    let lotsSucceeded = 0;
    for (const lot of exportLots) {
        const lotNumber = readLotNumber(lot);
        const detail = detailsByLot[lotNumber];
        if (!detail) {
            continue;
        }
        lotsSucceeded += 1;
        lot.sold = detail.sold === true;
        if (detail.reserveStatus) {
            lot.reserveStatus = detail.reserveStatus;
        }
        const reserveLabel = (0, reserve_status_1.resolveReserveStatusDisplayLabel)(detail.reserveStatus);
        lot.editPage = {
            url: detail.resolvedEditUrl ?? detail.detailUrl ?? lot.editUrl ?? "",
            sold: detail.sold === true,
            reserveStatus: reserveLabel || detail.reserveStatus || "Unknown",
            reserveDetails: {
                noReserve: detail.noReserve === true,
                reservesOff: detail.reservesOff === true,
                reservePriceRaw: detail.reservePriceRaw ?? null,
                reservePrice: detail.reservePrice ?? null,
            },
        };
        const photoUrls = Array.isArray(detail.photoUrls) ? detail.photoUrls : [];
        photoUrlsFound += photoUrls.length;
        lot.photoUrls = photoUrls;
        const workerPhotos = Array.isArray(detail.photos) ? detail.photos : [];
        const mapped = (0, auction_photo_storage_1.mapWorkerPhotoReferences)({
            packageDir: input.packageDir,
            photos: workerPhotos,
        });
        photosDownloaded += mapped.photos.length;
        photosFailed += mapped.failed.length;
        lot.photos = mapped.photos.map((photo, index) => ({
            order: index + 1,
            remoteUrl: photo.sourceUrl ?? workerPhotos[index]?.sourceUrl ?? photoUrls[index],
            localPath: photo.relativePath ?? "",
            downloaded: Boolean(photo.relativePath),
            relativePath: photo.relativePath,
            sourceUrl: photo.sourceUrl,
            displayUrl: photo.relativePath
                ? buildAssetUrl(input.localApiBaseUrl, packageId, photo.relativePath)
                : undefined,
        }));
    }
    const failedLots = input.workerResult.failed ?? [];
    const lotsFailed = Math.max(exportLots.length - lotsSucceeded, failedLots.length);
    const activeLot = readLotNumber((input.snapshot.current ?? undefined)) ||
        readLotNumber((input.snapshot.auctionDisplay ?? undefined));
    const scrapedAt = typeof input.snapshot.auctionDisplay?.scrapedAt ===
        "string"
        ? input.snapshot.auctionDisplay.scrapedAt
        : typeof input.snapshot.updatedAt === "string"
            ? input.snapshot.updatedAt
            : exportedAt;
    const exportPayload = {
        formatVersion: offline_auction_types_1.OFFLINE_AUCTION_FORMAT_VERSION,
        exportedAt,
        source: "webpage-scraper",
        auction: {
            name: input.projectName,
            sourceUrl: typeof input.snapshot.sourceUrl === "string" ? input.snapshot.sourceUrl : undefined,
        },
        scrape: {
            scrapedAt,
            sourceUrl: typeof input.snapshot.sourceUrl === "string" ? input.snapshot.sourceUrl : undefined,
            activeLot: activeLot || undefined,
            snapshot: input.snapshot,
        },
        activeLot: activeLot || undefined,
        lotCount: exportLots.length,
        lots: exportLots,
        photoDiscovery: {
            attempted: exportLots.length,
            succeeded: lotsSucceeded,
            failed: failedLots.map((failure) => ({
                lot: failure.lot,
                editUrl: failure.editUrl,
                reason: failure.reason,
            })),
            diagnostics: {
                lotsWithPhotos: exportLots.filter((lot) => Array.isArray(lot.photos)
                    ? lot.photos.some((photo) => typeof photo !== "string" && photo.downloaded === true)
                    : false).length,
                totalPhotoUrls: photoUrlsFound,
                photoDownloadsQueued: photoUrlsFound,
                photoDownloadsSucceeded: photosDownloaded,
                photoDownloadsFailed: photosFailed,
                photoFilesWritten: photosDownloaded,
                photoFilesPresentAfterFinalize: photosDownloaded,
            },
        },
        exportDiagnostics: {
            lotsTotal: exportLots.length,
            lotsProcessed: exportLots.length,
            lotsSucceeded,
            lotsFailed,
            photoUrlsFound,
            photosDownloaded,
            photosFailed,
            lotFailures: failedLots.map((failure) => ({
                lotNumber: failure.lot,
                vehicleId: null,
                editUrl: failure.editUrl,
                stage: "worker-export",
                reason: failure.reason,
            })),
        },
        comprehensiveDiagnostics: input.workerResult.comprehensiveDiagnostics,
    };
    return {
        export: exportPayload,
        diagnostics: {
            lotsTotal: exportLots.length,
            lotsSucceeded,
            lotsFailed,
            photoUrlsFound,
            photosDownloaded,
            photosFailed,
        },
    };
}
function mapWorkerExportError(error, context) {
    const message = error instanceof Error ? error.message : String(error);
    if (/sign_in|no longer authenticated|login page|not authenticated/i.test(message)) {
        return exports.WORKER_EXPORT_ERRORS.AUTH_LOST;
    }
    if (/browser disconnected|browser session is unavailable|browser is not connected/i.test(message)) {
        return context.engineRunning
            ? exports.WORKER_EXPORT_ERRORS.BROWSER_DISCONNECTED
            : exports.WORKER_EXPORT_ERRORS.SCRAPER_STOPPED;
    }
    if (!context.engineManagerAttached) {
        return exports.WORKER_EXPORT_ERRORS.WORKER_MISSING;
    }
    if (!context.engineRunning) {
        return exports.WORKER_EXPORT_ERRORS.SCRAPER_STOPPED;
    }
    if (/worker could not be found|engine manager is not attached/i.test(message)) {
        return exports.WORKER_EXPORT_ERRORS.WORKER_MISSING;
    }
    return message;
}
