"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBroadArrowOfflineExport = runBroadArrowOfflineExport;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const auction_data_paths_1 = require("./auction-data-paths");
const broad_arrow_export_auth_1 = require("./broad-arrow-export-auth");
const project_scraper_auth_1 = require("./project-scraper-auth");
const broad_arrow_export_photo_download_1 = require("./broad-arrow-export-photo-download");
const broad_arrow_export_reserve_1 = require("./broad-arrow-export-reserve");
const bag_edit_url_resolution_1 = require("./bag-edit-url-resolution");
const bag_detail_adapter_path_1 = require("./bag-detail-adapter-path");
const import_esm_module_1 = require("./import-esm-module");
const resolve_puppeteer_module_1 = require("./resolve-puppeteer-module");
const offline_auction_types_1 = require("./offline-auction-types");
const reserve_status_1 = require("../bag/reserve-status");
function readLotNumber(lot) {
    if (!lot)
        return "";
    const raw = lot.lotNumber ?? lot.lot ?? "";
    return raw.replace(/^lot\s+/i, "").trim();
}
function cloneLot(lot) {
    return JSON.parse(JSON.stringify(lot));
}
function dedupePhotoUrls(urls) {
    const ordered = [];
    const seen = new Set();
    for (const url of urls) {
        if (!url || seen.has(url))
            continue;
        seen.add(url);
        ordered.push(url);
    }
    return ordered;
}
function reserveStatusForStorage(label) {
    switch (label) {
        case "No Reserve":
            return (0, reserve_status_1.serializeReserveStatusForStorage)("offered_without_reserve");
        case "Reserve Off":
            return (0, reserve_status_1.serializeReserveStatusForStorage)("unknown");
        case "Reserve":
            return (0, reserve_status_1.serializeReserveStatusForStorage)("has_reserve");
        default:
            return (0, reserve_status_1.serializeReserveStatusForStorage)("unknown");
    }
}
function buildAssetUrl(localApiBaseUrl, packageId, relativePath) {
    const encoded = relativePath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    return `${localApiBaseUrl}/api/offline-assets/${encodeURIComponent(packageId)}/${encoded}`;
}
function removePartialPackage(packageDir) {
    if (fs_1.default.existsSync(packageDir)) {
        fs_1.default.rmSync(packageDir, { recursive: true, force: true });
    }
}
async function runBroadArrowOfflineExport(input) {
    const isCancelled = input.isCancelled ?? (() => false);
    const exportedAt = new Date().toISOString();
    const sourceLots = Array.isArray(input.snapshot.lots)
        ? input.snapshot.lots
        : [];
    const exportLots = sourceLots.map(cloneLot);
    const auctionOrigin = (0, bag_edit_url_resolution_1.resolveAuctionOriginForExport)({
        snapshot: input.snapshot,
        dataSources: input.dataSources,
        engineId: input.engineId,
    });
    const diagnostics = {
        lotsTotal: exportLots.length,
        lotsProcessed: 0,
        lotsSucceeded: 0,
        lotsFailed: 0,
        photoUrlsFound: 0,
        photosDownloaded: 0,
        photosFailed: 0,
        lotFailures: [],
    };
    const activeLot = readLotNumber(input.snapshot.current) ||
        readLotNumber(input.snapshot.auctionDisplay);
    const scrapedAt = typeof input.snapshot.auctionDisplay?.scrapedAt ===
        "string"
        ? input.snapshot.auctionDisplay.scrapedAt
        : typeof input.snapshot.updatedAt === "string"
            ? input.snapshot.updatedAt
            : exportedAt;
    input.onProgress({
        phase: "preparing",
        message: "Preparing export…",
        completed: 0,
        total: exportLots.length,
    });
    if (!(0, project_scraper_auth_1.getProjectWebpageScraperCredentials)(input.credentials, input.engineId)) {
        throw new Error(project_scraper_auth_1.BAG_EXPORT_CREDENTIALS_REQUIRED_MESSAGE);
    }
    input.onProgress({
        phase: "loading-scraper-data",
        message: `Loaded ${exportLots.length} lots from Webpage Scraper snapshot.`,
        completed: 0,
        total: exportLots.length,
    });
    const lotDetailAdapter = (0, bag_detail_adapter_path_1.resolveBagLotDetailAdapterPath)(input.paths);
    (0, bag_detail_adapter_path_1.assertDataEngineModuleExists)(lotDetailAdapter);
    const lotDetailModule = await (0, import_esm_module_1.nativeImport)(lotDetailAdapter.moduleUrl);
    const browserUserDataDir = path_1.default.join(input.paths.browserData, input.engineId);
    fs_1.default.mkdirSync(browserUserDataDir, { recursive: true });
    fs_1.default.mkdirSync(input.paths.cookies, { recursive: true });
    process.env.NEUD_APP_DATA_DIR = input.paths.root;
    process.env.NEUD_BROWSER_USER_DATA_DIR = browserUserDataDir;
    process.env.NEUD_COOKIES_DIR = input.paths.cookies;
    process.env.ENGINE_ID = input.engineId;
    const { puppeteer, resolvedBrowser, buildPuppeteerLaunchOptions } = await (0, resolve_puppeteer_module_1.resolvePuppeteerModule)(input.paths, lotDetailAdapter.workerRoot);
    const launchOptions = buildPuppeteerLaunchOptions(resolvedBrowser, {
        headless: true,
        userDataDir: browserUserDataDir,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    let browser = null;
    let detailPage = null;
    let photoPage = null;
    const packageDir = input.packagePaths.packageDir;
    const lotFolderCounts = new Map();
    try {
        browser = (await puppeteer.launch(launchOptions));
        detailPage = await browser.newPage();
        input.onProgress({
            phase: "signing-in",
            message: "Signing in to auction website…",
            completed: 0,
            total: exportLots.length,
        });
        await (0, broad_arrow_export_auth_1.authenticateBroadArrowExportBrowser)({
            paths: input.paths,
            engineId: input.engineId,
            page: detailPage,
            credentials: input.credentials,
            dataSources: input.dataSources,
        });
        photoPage = await browser.newPage();
        for (let index = 0; index < exportLots.length; index += 1) {
            if (isCancelled()) {
                throw new Error("Export cancelled.");
            }
            const lot = exportLots[index];
            const lotNumber = readLotNumber(lot);
            const { editUrl, vehicleId } = (0, bag_edit_url_resolution_1.resolveLotEditUrlFromLot)(lot, auctionOrigin);
            diagnostics.lotsProcessed += 1;
            input.onProgress({
                phase: "processing-lots",
                message: `Processing lot ${index + 1} of ${exportLots.length}${lotNumber ? `: Lot ${lotNumber}` : ""}`,
                completed: index,
                total: exportLots.length,
            });
            if (!lotNumber) {
                diagnostics.lotsFailed += 1;
                diagnostics.lotFailures.push({
                    lotNumber: "",
                    vehicleId,
                    editUrl,
                    stage: "url-resolution",
                    reason: "Lot number is missing.",
                });
                continue;
            }
            if (!editUrl) {
                diagnostics.lotsFailed += 1;
                diagnostics.lotFailures.push({
                    lotNumber,
                    vehicleId,
                    editUrl: null,
                    stage: "url-resolution",
                    reason: "Could not resolve a valid Edit URL.",
                });
                continue;
            }
            lot.editUrl = editUrl;
            if (vehicleId) {
                lot.vehicleId = vehicleId;
            }
            try {
                const detail = await lotDetailModule.fetchLotDetailData(detailPage, editUrl, {
                    auctionUrl: auctionOrigin,
                    timeout: 45000,
                    shouldAbort: isCancelled,
                    login: async () => {
                        await (0, broad_arrow_export_auth_1.authenticateBroadArrowExportBrowser)({
                            paths: input.paths,
                            engineId: input.engineId,
                            page: detailPage,
                            credentials: input.credentials,
                            dataSources: input.dataSources,
                        });
                    },
                });
                const reserveDetails = (0, broad_arrow_export_reserve_1.readReserveDetailsFromDetail)(detail);
                const reserveStatusLabel = (0, broad_arrow_export_reserve_1.deriveBroadArrowReserveStatusLabel)(reserveDetails);
                lot.sold = detail.sold === true;
                lot.reserveStatus = reserveStatusForStorage(reserveStatusLabel);
                lot.editPage = {
                    url: editUrl,
                    sold: detail.sold === true,
                    reserveStatus: reserveStatusLabel,
                    reserveDetails,
                };
                const photoUrls = dedupePhotoUrls(Array.isArray(detail.photoUrls)
                    ? detail.photoUrls.filter((url) => typeof url === "string")
                    : []);
                diagnostics.photoUrlsFound += photoUrls.length;
                const folderKey = (0, broad_arrow_export_photo_download_1.sanitizeLotPhotoFolder)(lotNumber);
                const folderUseCount = (lotFolderCounts.get(folderKey) ?? 0) + 1;
                lotFolderCounts.set(folderKey, folderUseCount);
                const lotFolder = folderUseCount > 1 && vehicleId
                    ? `${folderKey}-vehicle-${vehicleId}`
                    : folderKey;
                const exportedPhotos = [];
                for (let photoIndex = 0; photoIndex < photoUrls.length; photoIndex += 1) {
                    if (isCancelled()) {
                        throw new Error("Export cancelled.");
                    }
                    const photoUrl = photoUrls[photoIndex];
                    input.onProgress({
                        phase: "processing-lots",
                        message: `Downloading photo ${photoIndex + 1} of ${photoUrls.length} for Lot ${lotNumber}`,
                        completed: index,
                        total: exportLots.length,
                    });
                    const sequence = String(photoIndex + 1).padStart(2, "0");
                    const relativeStem = path_1.default.posix.join("photos", lotFolder, sequence);
                    const absoluteStem = path_1.default.join(packageDir, relativeStem);
                    try {
                        const downloaded = await (0, broad_arrow_export_photo_download_1.downloadExportPhotoBytes)({
                            photoUrl,
                            destinationPath: absoluteStem,
                            page: photoPage,
                        });
                        const relativePath = path_1.default
                            .relative(packageDir, downloaded.finalPath)
                            .replace(/\\/g, "/");
                        diagnostics.photosDownloaded += 1;
                        exportedPhotos.push({
                            order: photoIndex + 1,
                            remoteUrl: photoUrl,
                            localPath: relativePath,
                            downloaded: true,
                            relativePath,
                            sourceUrl: photoUrl,
                        });
                    }
                    catch (error) {
                        diagnostics.photosFailed += 1;
                        exportedPhotos.push({
                            order: photoIndex + 1,
                            remoteUrl: photoUrl,
                            localPath: "",
                            downloaded: false,
                            sourceUrl: photoUrl,
                        });
                        diagnostics.lotFailures.push({
                            lotNumber,
                            vehicleId,
                            editUrl,
                            stage: "photo-download",
                            reason: error instanceof Error ? error.message : "Photo download failed.",
                        });
                    }
                }
                const packageId = path_1.default.basename(packageDir).replace(/\.partial$/i, "");
                lot.photos = exportedPhotos.map((photo) => {
                    if (typeof photo === "string")
                        return photo;
                    if (photo.relativePath) {
                        return {
                            ...photo,
                            displayUrl: buildAssetUrl(input.localApiBaseUrl, packageId, photo.relativePath),
                        };
                    }
                    return photo;
                });
                lot.photoUrls = photoUrls;
                diagnostics.lotsSucceeded += 1;
            }
            catch (error) {
                diagnostics.lotsFailed += 1;
                const stage = error instanceof Error && "stage" in error
                    ? String(error.stage ?? "unknown")
                    : "unknown";
                diagnostics.lotFailures.push({
                    lotNumber,
                    vehicleId,
                    editUrl,
                    stage,
                    reason: error instanceof Error ? error.message : "Lot export failed.",
                });
            }
        }
        input.onProgress({
            phase: "writing-package",
            message: "Writing package…",
            completed: exportLots.length,
            total: exportLots.length,
        });
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
                attempted: diagnostics.lotsTotal,
                succeeded: diagnostics.lotsSucceeded,
                failed: diagnostics.lotFailures.map((failure) => ({
                    lot: failure.lotNumber,
                    editUrl: failure.editUrl ?? "",
                    reason: `[${failure.stage}] ${failure.reason}`,
                })),
                diagnostics: {
                    lotsWithPhotos: exportLots.filter((lot) => Array.isArray(lot.photos) ? lot.photos.some((photo) => typeof photo !== "string" && photo.downloaded) : false).length,
                    totalPhotoUrls: diagnostics.photoUrlsFound,
                    photoDownloadsQueued: diagnostics.photoUrlsFound,
                    photoDownloadsSucceeded: diagnostics.photosDownloaded,
                    photoDownloadsFailed: diagnostics.photosFailed,
                    photoFilesWritten: diagnostics.photosDownloaded,
                    photoFilesPresentAfterFinalize: diagnostics.photosDownloaded,
                },
            },
            exportDiagnostics: diagnostics,
        };
        fs_1.default.writeFileSync(input.packagePaths.jsonPath, JSON.stringify(exportPayload, null, 2), "utf8");
        const finalPackageDir = (0, auction_data_paths_1.finalizeDownloadPackage)(packageDir);
        const outputPath = path_1.default.join(finalPackageDir, "auction-data.json");
        return {
            export: exportPayload,
            outputPath,
            finalPackageDir,
            diagnostics,
        };
    }
    catch (error) {
        removePartialPackage(packageDir);
        throw error;
    }
    finally {
        await photoPage?.close().catch(() => { });
        await detailPage?.close().catch(() => { });
        await browser?.close().catch(() => { });
    }
}
