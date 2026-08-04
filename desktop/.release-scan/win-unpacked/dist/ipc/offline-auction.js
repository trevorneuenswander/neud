"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerOfflineAuctionIpc = registerOfflineAuctionIpc;
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const auction_data_paths_1 = require("../services/auction-data-paths");
const channels_1 = require("./channels");
function getSenderWindow(event) {
    const window = electron_1.BrowserWindow.fromWebContents(event.sender);
    return window && !window.isDestroyed() ? window : null;
}
function pushProgress(window, payload) {
    if (!window || window.isDestroyed())
        return;
    (0, channels_1.sendToRenderer)(window, "neud:offline:progress", payload);
}
function broadcastExportProgress(payload) {
    (0, channels_1.broadcastToAllRenderers)("neud:offline:progress", payload);
}
function registerOfflineAuctionIpc(deps) {
    deps.offlineAuction.setProgressBroadcaster((event) => {
        broadcastExportProgress(event);
    });
    deps.offlineAuction.setExportCompletionHandler(async ({ projectId, result }) => {
        const engineId = deps.data.getPrimaryBagEngineIdPublic();
        if (!result.ok) {
            if (engineId) {
                deps.data.recordLog(engineId, {
                    level: "error",
                    eventType: "offline.export.failed",
                    message: result.error,
                });
            }
            return;
        }
        if (engineId) {
            deps.data.recordLog(engineId, {
                level: "info",
                eventType: "offline.export.adapter-loaded",
                message: "BAG lot-detail adapter loaded",
            });
        }
        const datasetReference = deps.auctionDataset.setDownloaded(projectId, result.outputPath);
        const hasDirtyDraft = deps.data.hasDirtyLocalControllerDraft(projectId);
        const actor = deps.data.resolveCurrentActivityActor();
        if (!hasDirtyDraft) {
            const loaded = deps.offlineAuction.loadJsonExport(projectId, result.outputPath);
            if (loaded.ok && loaded.auctionData) {
                deps.data.loadOfflineAuction(projectId, loaded.auctionData, actor);
            }
        }
        if (engineId) {
            deps.data.recordLog(engineId, {
                level: "info",
                eventType: "offline.export.completed",
                message: `Auction package completed: ${path_1.default.basename(path_1.default.dirname(result.outputPath))}`,
                metadata: {
                    outputPath: result.outputPath,
                    lotCount: result.export.lotCount,
                    photoDiscoveryAttempted: result.export.photoDiscovery.attempted,
                    photoDiscoverySucceeded: result.export.photoDiscovery.succeeded,
                    photoDiscoveryFailed: result.export.photoDiscovery.failed.length,
                },
            });
            deps.data.recordLog(engineId, {
                level: "info",
                eventType: "offline.dataset.active",
                message: `Active auction dataset set to ${datasetReference.filename ?? path_1.default.basename(result.outputPath)}`,
                metadata: {
                    filePath: result.outputPath,
                    source: datasetReference.source,
                },
            });
        }
    });
    (0, channels_1.registerIpcHandler)("neud:offline:hasValidScrape", (_event, projectId) => {
        if (typeof projectId !== "string" || !projectId.trim()) {
            return false;
        }
        return deps.offlineAuction.canExportCurrentWebpage(projectId);
    });
    (0, channels_1.registerIpcHandler)("neud:offline:isExportInProgress", (_event, projectId) => {
        if (typeof projectId === "string" && projectId.trim()) {
            return deps.offlineAuction.isExportInProgressForProject(projectId);
        }
        return deps.offlineAuction.isExportInProgress();
    });
    (0, channels_1.registerIpcHandler)("neud:offline:getExportOperation", (_event, projectId) => {
        if (typeof projectId !== "string" || !projectId.trim()) {
            return null;
        }
        return deps.offlineAuction.getCurrentWebpageExportOperation(projectId);
    });
    (0, channels_1.registerIpcHandler)("neud:offline:listExportOperations", () => {
        return deps.offlineAuction.listCurrentWebpageExportOperations();
    });
    (0, channels_1.registerIpcHandler)("neud:offline:getActiveDataset", (_event, projectId) => {
        if (typeof projectId !== "string" || !projectId.trim()) {
            return null;
        }
        return deps.data.getActiveAuctionDatasetDisplay(projectId);
    });
    (0, channels_1.registerIpcHandler)("neud:offline:getActiveDownloadedDataset", (_event, projectId) => {
        if (typeof projectId !== "string" || !projectId.trim()) {
            return null;
        }
        return deps.data.getActiveDownloadedDataset(projectId);
    });
    (0, channels_1.registerIpcHandler)("neud:offline:dismissExportOperation", (_event, payload) => {
        if (!payload ||
            typeof payload !== "object" ||
            typeof payload.projectId !== "string" ||
            typeof payload.operationId !== "string") {
            return { ok: false, error: "Project id and operation id are required." };
        }
        const { projectId, operationId } = payload;
        return deps.offlineAuction.dismissCurrentWebpageExportOperation(projectId, operationId);
    });
    (0, channels_1.registerIpcHandler)("neud:offline:getLotThumbnailPhotos", (_event, payload) => {
        if (!payload ||
            typeof payload !== "object" ||
            typeof payload.projectId !== "string" ||
            typeof payload.lotNumber !== "string") {
            return [];
        }
        const { projectId, lotNumber } = payload;
        return deps.data.getLotThumbnailPhotos(projectId, lotNumber);
    });
    (0, channels_1.registerIpcHandler)("neud:offline:importLotPhotos", async (event, payload) => {
        if (!payload ||
            typeof payload !== "object" ||
            typeof payload.projectId !== "string" ||
            typeof payload.lotNumber !== "string") {
            throw new Error("Project id and lot number are required.");
        }
        const { projectId, lotNumber } = payload;
        const window = getSenderWindow(event);
        const openResult = window
            ? await electron_1.dialog.showOpenDialog(window, {
                title: "Add Lot Photos",
                properties: ["openFile", "multiSelections"],
                filters: [
                    { name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] },
                ],
            })
            : await electron_1.dialog.showOpenDialog({
                title: "Add Lot Photos",
                properties: ["openFile", "multiSelections"],
                filters: [
                    { name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] },
                ],
            });
        if (openResult.canceled || openResult.filePaths.length === 0) {
            return { ok: false, cancelled: true };
        }
        return deps.data.importLotPhotos(projectId, lotNumber, openResult.filePaths);
    });
    (0, channels_1.registerIpcHandler)("neud:offline:getLotDatasetDetails", (_event, payload) => {
        if (!payload ||
            typeof payload !== "object" ||
            typeof payload.projectId !== "string" ||
            typeof payload.lotNumber !== "string") {
            return null;
        }
        const { projectId, lotNumber } = payload;
        return deps.data.getLotDatasetDetails(projectId, lotNumber);
    });
    (0, channels_1.registerIpcHandler)("neud:offline:listDownloads", (_event, projectId) => {
        if (typeof projectId !== "string" || !projectId.trim()) {
            return [];
        }
        return deps.data.listAuctionDownloads(projectId);
    });
    (0, channels_1.registerIpcHandler)("neud:offline:refreshDownloads", (_event, projectId) => {
        if (typeof projectId !== "string" || !projectId.trim()) {
            return null;
        }
        return deps.data.refreshAuctionDataset(projectId);
    });
    (0, channels_1.registerIpcHandler)("neud:offline:clearDownloads", async (_event, projectId) => {
        if (typeof projectId !== "string" || !projectId.trim()) {
            throw new Error("Project id is required.");
        }
        const result = deps.data.clearAllAuctionDownloads(projectId);
        return {
            ...result,
            dataset: result.ok ? deps.data.getActiveAuctionDatasetDisplay(projectId) : undefined,
            envelope: "envelope" in result ? result.envelope : undefined,
        };
    });
    (0, channels_1.registerIpcHandler)("neud:offline:openDownloadRoot", async (_event, projectId) => {
        if (typeof projectId !== "string" || !projectId.trim()) {
            return { ok: false, error: "Project id is required." };
        }
        try {
            const project = deps.data.getProjectById(projectId);
            if (!project) {
                return { ok: false, error: "Project not found." };
            }
            const downloadRoot = (0, auction_data_paths_1.getProjectAuctionDataDirectory)(project.slug);
            const openResult = await electron_1.shell.openPath(downloadRoot);
            if (openResult) {
                return { ok: false, error: "Unable to open the download folder." };
            }
            return { ok: true, path: downloadRoot };
        }
        catch {
            return { ok: false, error: "Unable to open the download folder." };
        }
    });
    (0, channels_1.registerIpcHandler)("neud:offline:openDownloadFolder", async (_event, projectId) => {
        if (typeof projectId !== "string" || !projectId.trim()) {
            throw new Error("Project id is required.");
        }
        const project = deps.data.getProjectById(projectId);
        const selected = deps.data.resolveAuctionDownloadFolder(projectId);
        const target = selected ?? (project ? (0, auction_data_paths_1.getProjectAuctionDataDirectory)(project.slug) : (0, auction_data_paths_1.getAuctionDataDirectory)());
        await electron_1.shell.openPath(target);
        return { ok: true, path: target };
    });
    (0, channels_1.registerIpcHandler)("neud:offline:cancelExport", (_event, operationId) => {
        if (typeof operationId !== "string" || !operationId.trim()) {
            return { ok: false, error: "Operation id is required." };
        }
        return deps.offlineAuction.cancelCurrentWebpageDownload(operationId);
    });
    (0, channels_1.registerIpcHandler)("neud:offline:export", async (event, projectId) => {
        if (typeof projectId !== "string" || !projectId.trim()) {
            throw new Error("Project id is required.");
        }
        const engineId = deps.data.getPrimaryBagEngineIdPublic();
        const project = deps.data.getProjectById(projectId);
        if (!project) {
            throw new Error("Project not found.");
        }
        const start = deps.offlineAuction.startExportCurrentWebpage(projectId);
        if (!start.ok) {
            return { ok: false, error: start.error };
        }
        if (!start.alreadyRunning && engineId) {
            deps.data.recordLog(engineId, {
                level: "info",
                eventType: "offline.export.started",
                message: "Auction export started",
            });
        }
        return {
            ok: true,
            operationId: start.operationId,
            alreadyRunning: start.alreadyRunning ?? false,
        };
    });
    (0, channels_1.registerIpcHandler)("neud:offline:load", async (event, projectId) => {
        if (typeof projectId !== "string" || !projectId.trim()) {
            throw new Error("Project id is required.");
        }
        const project = deps.data.getProjectById(projectId);
        if (!project) {
            return { ok: false, error: "Project not found." };
        }
        const window = getSenderWindow(event);
        const defaultPath = (0, auction_data_paths_1.getProjectAuctionDataDirectory)(project.slug);
        const openDialogOptions = {
            title: "Load Broad Arrow Download",
            defaultPath,
            properties: ["openDirectory"],
        };
        const openResult = window
            ? await electron_1.dialog.showOpenDialog(window, openDialogOptions)
            : await electron_1.dialog.showOpenDialog(openDialogOptions);
        if (openResult.canceled || openResult.filePaths.length === 0) {
            return { ok: false, cancelled: true };
        }
        const selectedDir = openResult.filePaths[0];
        const actor = deps.data.resolveCurrentActivityActor();
        const engineId = deps.data.getPrimaryBagEngineIdPublic();
        if (engineId) {
            deps.data.recordLog(engineId, {
                level: "info",
                eventType: "offline.load.dialog-opened",
                message: "Load folder picker opened at project download root",
                metadata: { defaultPath, selectedDir },
            });
        }
        try {
            const validated = deps.offlineAuction.validatePackageDirectory(selectedDir);
            if (!validated.ok) {
                return {
                    ok: false,
                    error: "The selected folder does not contain a valid Broad Arrow download.",
                };
            }
            const resolvedJsonPath = (0, auction_data_paths_1.resolveAuctionJsonPathInPackage)(selectedDir);
            if (!resolvedJsonPath) {
                return {
                    ok: false,
                    error: "The selected folder does not contain a valid Broad Arrow download.",
                };
            }
            const loaded = deps.offlineAuction.loadJsonExport(projectId, resolvedJsonPath);
            if (!loaded.ok || !loaded.auctionData) {
                return {
                    ok: false,
                    error: "The selected folder does not contain a valid Broad Arrow download.",
                };
            }
            const mutation = deps.data.loadOfflineAuction(projectId, loaded.auctionData, actor);
            if (!mutation.ok) {
                return { ok: false, error: mutation.error };
            }
            const datasetReference = deps.auctionDataset.setLoaded(projectId, resolvedJsonPath);
            if (engineId) {
                deps.data.recordLog(engineId, {
                    level: "info",
                    eventType: "offline.load.completed",
                    message: `Loaded auction package: ${path_1.default.basename(selectedDir)}`,
                    metadata: {
                        lotCount: loaded.lotCount,
                        filePath: resolvedJsonPath,
                        packageRoot: selectedDir,
                    },
                });
                deps.data.recordLog(engineId, {
                    level: "info",
                    eventType: "offline.dataset.active",
                    message: `Active auction dataset set to ${datasetReference.filename ?? path_1.default.basename(resolvedJsonPath)}`,
                    metadata: {
                        filePath: resolvedJsonPath,
                        source: datasetReference.source,
                        packageRoot: selectedDir,
                    },
                });
            }
            return {
                ok: true,
                lotCount: loaded.lotCount,
                envelope: mutation.envelope,
                dataset: deps.data.getActiveAuctionDatasetDisplay(projectId),
            };
        }
        catch {
            return {
                ok: false,
                error: "The selected folder does not contain a valid Broad Arrow download.",
            };
        }
    });
}
