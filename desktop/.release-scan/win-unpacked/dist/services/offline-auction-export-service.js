"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OfflineAuctionExportService = void 0;
exports.defaultOfflineExportFileName = defaultOfflineExportFileName;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const offline_auction_types_1 = require("./offline-auction-types");
const reserve_status_1 = require("../bag/reserve-status");
const auction_data_paths_1 = require("./auction-data-paths");
const auction_export_progress_1 = require("./auction-export-progress");
const lot_thumbnail_service_1 = require("./lot-thumbnail-service");
const bag_manual_validation_1 = require("../bag/live-state/bag-manual-validation");
const worker_auction_export_bridge_1 = require("./worker-auction-export-bridge");
const webpage_export_operations_1 = require("./webpage-export-operations");
const project_scraper_auth_1 = require("./project-scraper-auth");
function readLotNumber(lot) {
    if (!lot)
        return "";
    const raw = lot.lotNumber ?? lot.lot ?? "";
    return raw.replace(/^lot\s+/i, "").trim();
}
class OfflineAuctionExportService {
    paths;
    projects;
    dataSources;
    credentials;
    localApiBaseUrl;
    packages = new Map();
    operations = new Map();
    operationTrackers = new Map();
    partialPackageByOperation = new Map();
    exportInProgress = false;
    exportCancelled = false;
    engineManager = null;
    activeOperationId = null;
    operationGeneration = 0;
    progressBroadcaster = null;
    completionHandler = null;
    lastProgressEmitAt = 0;
    constructor(paths, projects, dataSources, credentials, localApiBaseUrl) {
        this.paths = paths;
        this.projects = projects;
        this.dataSources = dataSources;
        this.credentials = credentials;
        this.localApiBaseUrl = localApiBaseUrl;
        this.loadRegisteredPackages();
    }
    attachEngineManager(engineManager) {
        this.engineManager = engineManager;
    }
    handleWorkerEvent(payload) {
        const operation = this.operations.get(payload.operationId);
        if (!operation)
            return;
        if (payload.generation !== undefined && payload.generation !== operation.generation) {
            return;
        }
        if (payload.workerId && operation.workerId && payload.workerId !== operation.workerId) {
            return;
        }
        if (payload.type === "comprehensive-export-started") {
            this.applyWorkerLifecyclePatch(operation.operationId, {
                status: "running",
                requestId: payload.requestId,
                workerId: payload.workerId,
                workerAcceptedAt: new Date().toISOString(),
                lastWorkerEventAt: new Date().toISOString(),
                message: payload.message ?? "Downloading Current Webpage…",
            });
            return;
        }
        if (payload.type === "comprehensive-export-progress") {
            this.applyWorkerProgress(operation.operationId, payload);
            return;
        }
        if (payload.type === "comprehensive-export-complete") {
            return;
        }
        if (payload.type === "comprehensive-export-cancelled") {
            this.applyTerminalPatch(operation.operationId, {
                status: "cancelled",
                phase: "error",
                finishedAt: new Date().toISOString(),
                message: "Download cancelled",
                error: "Download cancelled",
                terminalEventSource: "worker",
            });
            this.cleanupPartialPackage(operation.operationId, "cancelled");
            return;
        }
        if (payload.type === "comprehensive-export-failed") {
            if (this.isTerminalSuccess(operation.status)) {
                return;
            }
            this.applyTerminalPatch(operation.operationId, {
                status: "failed",
                phase: "error",
                finishedAt: new Date().toISOString(),
                message: payload.error ?? "Download failed.",
                error: payload.error ?? "Download failed.",
                terminalEventSource: "worker",
            });
        }
    }
    cancelCurrentWebpageDownload(operationId) {
        const operation = this.operations.get(operationId);
        if (!operation) {
            return { ok: false, error: "Download operation was not found." };
        }
        if (!(0, webpage_export_operations_1.isActiveWebpageExportStatus)(operation.status)) {
            return { ok: false, error: "No active download operation is running." };
        }
        this.exportCancelled = true;
        this.updateOperation(operationId, {
            status: "cancelling",
            message: "Cancelling Current Webpage download…",
        });
        if (this.engineManager && operation.requestId) {
            const engineId = this.getWebpageScraperEngineId(operation.projectId);
            if (engineId) {
                this.engineManager.cancelExportCurrentAuction(engineId, operationId);
            }
        }
        return { ok: true };
    }
    setProgressBroadcaster(broadcaster) {
        this.progressBroadcaster = broadcaster;
    }
    setExportCompletionHandler(handler) {
        this.completionHandler = handler;
    }
    getCurrentWebpageExportOperation(projectId) {
        let latest = null;
        for (const operation of this.operations.values()) {
            if (operation.projectId !== projectId)
                continue;
            if (!latest || operation.startedAt > latest.startedAt) {
                latest = operation;
            }
        }
        return latest ? this.resolvePresentedExportOperation(latest) : null;
    }
    dismissCurrentWebpageExportOperation(projectId, operationId) {
        const operation = this.operations.get(operationId);
        if (!operation || operation.projectId !== projectId) {
            return { ok: false, error: "Download operation was not found." };
        }
        if ((0, webpage_export_operations_1.isActiveWebpageExportStatus)(operation.status)) {
            return { ok: false, error: "Active downloads cannot be dismissed." };
        }
        this.updateOperation(operationId, {
            presentationDismissedAt: new Date().toISOString(),
        });
        if (this.activeOperationId === operationId) {
            this.activeOperationId = null;
            this.exportInProgress = false;
        }
        return { ok: true };
    }
    resolvePresentedExportOperation(operation) {
        if ((0, webpage_export_operations_1.isActiveWebpageExportStatus)(operation.status)) {
            return operation;
        }
        if (operation.presentationDismissedAt) {
            return null;
        }
        if ((operation.status === "completed" || operation.status === "cancelled") &&
            operation.dismissAfter &&
            Date.now() >= Date.parse(operation.dismissAfter)) {
            if (!operation.presentationDismissedAt) {
                this.updateOperation(operation.operationId, {
                    presentationDismissedAt: new Date().toISOString(),
                });
            }
            if (this.activeOperationId === operation.operationId) {
                this.activeOperationId = null;
                this.exportInProgress = false;
            }
            return null;
        }
        if (operation.status === "completed" ||
            operation.status === "completed-with-warnings" ||
            operation.status === "failed" ||
            operation.status === "cancelled") {
            return operation;
        }
        return null;
    }
    listCurrentWebpageExportOperations() {
        return [...this.operations.values()].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
    }
    isExportInProgressForProject(projectId) {
        const operation = this.getCurrentWebpageExportOperation(projectId);
        return operation ? (0, webpage_export_operations_1.isActiveWebpageExportStatus)(operation.status) : false;
    }
    startExportCurrentWebpage(projectId) {
        const active = this.getActiveOperation();
        if (active && (0, webpage_export_operations_1.isActiveWebpageExportStatus)(active.status)) {
            if (active.projectId === projectId) {
                return { ok: true, operationId: active.operationId, alreadyRunning: true };
            }
            return {
                ok: false,
                error: "A Current Webpage download is already in progress.",
            };
        }
        const validation = this.validateExportStart(projectId);
        if (!validation.ok) {
            return validation;
        }
        const operationId = (0, crypto_1.randomUUID)();
        const project = this.projects.getById(projectId);
        this.operationGeneration += 1;
        const presented = this.getCurrentWebpageExportOperation(projectId);
        if (presented?.status === "completed") {
            this.dismissCurrentWebpageExportOperation(projectId, presented.operationId);
        }
        const operation = {
            operationId,
            projectId,
            projectSlug: project?.slug,
            generation: this.operationGeneration,
            status: "queued",
            phase: "preparing",
            percent: 0,
            message: "Preparing export…",
            completedLots: 0,
            totalLots: validation.tasks.length,
            completedUnits: 0,
            totalUnits: validation.tasks.length * 2,
            startedAt: new Date().toISOString(),
        };
        this.operations.set(operationId, operation);
        this.operationTrackers.set(operationId, (0, auction_export_progress_1.createAuctionExportProgressTracker)(validation.tasks.length));
        this.activeOperationId = operationId;
        this.exportInProgress = true;
        this.exportCancelled = false;
        this.publishOperationProgress(operation);
        void this.runExportOperation(operationId, projectId).then(async (result) => {
            if (this.completionHandler) {
                await this.completionHandler({ projectId, operationId, result });
            }
        });
        return { ok: true, operationId };
    }
    cancelActiveExportForShutdown() {
        this.exportCancelled = true;
        if (this.activeOperationId) {
            const operation = this.operations.get(this.activeOperationId);
            if (operation && (0, webpage_export_operations_1.isActiveWebpageExportStatus)(operation.status)) {
                this.updateOperation(this.activeOperationId, {
                    status: "cancelled",
                    phase: "error",
                    finishedAt: new Date().toISOString(),
                    message: "Download cancelled",
                    error: "Download cancelled",
                });
            }
        }
        this.exportInProgress = false;
    }
    isExportInProgress() {
        return this.exportInProgress;
    }
    getActiveOperation() {
        if (!this.activeOperationId)
            return null;
        return this.operations.get(this.activeOperationId) ?? null;
    }
    publishOperationProgress(operation) {
        this.progressBroadcaster?.((0, webpage_export_operations_1.operationToProgressEvent)(operation));
    }
    isTerminalSuccess(status) {
        return status === "completed" || status === "completed-with-warnings";
    }
    isTerminalState(status) {
        return (this.isTerminalSuccess(status) ||
            status === "failed" ||
            status === "cancelled");
    }
    applyWorkerLifecyclePatch(operationId, patch) {
        const current = this.operations.get(operationId);
        if (!current || this.isTerminalState(current.status)) {
            return;
        }
        this.updateOperation(operationId, patch);
    }
    applyTerminalPatch(operationId, patch) {
        const current = this.operations.get(operationId);
        if (!current)
            return;
        if (this.isTerminalSuccess(current.status)) {
            return;
        }
        if (current.terminalEventSource === "worker" &&
            patch.status === "failed" &&
            patch.terminalEventSource !== "worker") {
            return;
        }
        this.updateOperation(operationId, patch);
    }
    applyWorkerProgress(operationId, payload) {
        const current = this.operations.get(operationId);
        if (!current || this.isTerminalState(current.status)) {
            return;
        }
        let tracker = this.operationTrackers.get(operationId);
        if (!tracker) {
            tracker = (0, auction_export_progress_1.createAuctionExportProgressTracker)(payload.totalLots ?? current.totalLots);
            this.operationTrackers.set(operationId, tracker);
        }
        tracker.advance({
            phase: payload.progressPhase === "metadata"
                ? "metadata"
                : payload.progressPhase === "photos"
                    ? "photos"
                    : payload.progressPhase === "writing"
                        ? "writing-package"
                        : "metadata",
            totalLots: payload.totalLots,
            completedMetadataLots: payload.completedMetadataLots,
            totalPhotos: payload.totalPhotos,
            completedPhotos: payload.completedPhotos,
            currentLotNumber: payload.currentLotNumber,
            currentPhotoIndex: payload.currentPhotoIndex,
            message: payload.message,
        });
        const progress = tracker.toProgress(operationId);
        this.updateOperation(operationId, {
            status: current.status === "queued" || current.status === "preparing" ? "running" : current.status,
            phase: progress.phase,
            percent: progress.percent,
            message: progress.message,
            completedLots: tracker.state.completedMetadataLots,
            totalLots: tracker.state.totalLots,
            completedUnits: tracker.state.completedPhotos,
            totalUnits: tracker.state.totalPhotos,
            currentLotNumber: tracker.state.currentLotNumber,
            currentPhotoIndex: tracker.state.currentPhotoIndex,
            currentPhotoTotal: tracker.state.totalPhotos,
            lastWorkerEventAt: new Date().toISOString(),
        });
    }
    cleanupPartialPackage(operationId, reason) {
        const packageDir = this.partialPackageByOperation.get(operationId);
        if (!packageDir || !fs_1.default.existsSync(packageDir)) {
            return;
        }
        try {
            fs_1.default.rmSync(packageDir, { recursive: true, force: true });
        }
        catch {
            // Best-effort cleanup after worker-confirmed terminal state.
        }
        finally {
            this.partialPackageByOperation.delete(operationId);
        }
        void reason;
    }
    updateOperation(operationId, patch) {
        const current = this.operations.get(operationId);
        if (!current)
            return;
        const now = Date.now();
        const shouldThrottle = patch.status === "running" &&
            now - this.lastProgressEmitAt < 150 &&
            patch.percent !== undefined &&
            patch.percent === current.percent &&
            patch.message === current.message;
        if (shouldThrottle) {
            const next = { ...current, ...patch };
            this.operations.set(operationId, next);
            return;
        }
        const next = { ...current, ...patch };
        if (patch.status === "completed" && !next.dismissAfter) {
            next.dismissAfter = new Date(Date.now() + 5000).toISOString();
        }
        if (patch.status === "cancelled" && !next.dismissAfter) {
            next.dismissAfter = new Date(Date.now() + 5000).toISOString();
        }
        if (patch.percent !== undefined || patch.message !== undefined || patch.status !== undefined) {
            this.lastProgressEmitAt = now;
        }
        this.operations.set(operationId, next);
        this.publishOperationProgress(next);
    }
    validateExportStart(projectId) {
        const project = this.projects.getById(projectId);
        if (!project) {
            return { ok: false, error: "Project not found." };
        }
        const snapshot = this.getLatestScraperSnapshot(projectId);
        if (!snapshot) {
            return { ok: false, error: worker_auction_export_bridge_1.WORKER_EXPORT_ERRORS.NO_SNAPSHOT };
        }
        const engineId = this.getWebpageScraperEngineId(projectId);
        if (!engineId) {
            return { ok: false, error: "Webpage Scraper engine is not configured for this project." };
        }
        if (!this.engineManager) {
            return { ok: false, error: worker_auction_export_bridge_1.WORKER_EXPORT_ERRORS.WORKER_MISSING };
        }
        const engineRunning = this.engineManager.isEngineRunning(engineId);
        if (!engineRunning) {
            return { ok: false, error: worker_auction_export_bridge_1.WORKER_EXPORT_ERRORS.SCRAPER_STOPPED };
        }
        const tasks = (0, worker_auction_export_bridge_1.buildWorkerExportTasks)(snapshot, this.dataSources, engineId);
        if (tasks.length === 0) {
            return { ok: false, error: worker_auction_export_bridge_1.WORKER_EXPORT_ERRORS.NO_SNAPSHOT };
        }
        return { ok: true, engineId, snapshot, tasks };
    }
    getRegisteredPackage(packageId) {
        return this.packages.get(packageId) ?? null;
    }
    resolveAssetPath(packageId, relativePath) {
        const registered = this.packages.get(packageId);
        if (!registered)
            return null;
        const normalized = path_1.default
            .normalize(relativePath.replace(/\\/g, "/"))
            .replace(/^(\.\.(\/|\\|$))+/, "");
        if (normalized.startsWith("..") || path_1.default.isAbsolute(normalized)) {
            return null;
        }
        const absolutePath = path_1.default.join(registered.rootDir, normalized);
        const relative = path_1.default.relative(registered.rootDir, absolutePath);
        if (relative.startsWith("..") || path_1.default.isAbsolute(relative)) {
            return null;
        }
        if (!fs_1.default.existsSync(absolutePath) || !fs_1.default.statSync(absolutePath).isFile()) {
            return null;
        }
        return absolutePath;
    }
    getLatestScraperSnapshot(projectId) {
        const engineId = (0, project_scraper_auth_1.resolveProjectWebpageScraperEngineId)(this.dataSources, projectId);
        if (engineId) {
            const snapshot = this.dataSources.getLatestSnapshot(engineId);
            if (snapshot?.data && typeof snapshot.data === "object") {
                return snapshot.data;
            }
        }
        const engines = this.dataSources.listByProject(projectId);
        for (const engine of engines) {
            const snapshot = this.dataSources.getLatestSnapshot(engine.id);
            if (snapshot?.data && typeof snapshot.data === "object") {
                return snapshot.data;
            }
        }
        return null;
    }
    getWebpageScraperEngineId(projectId) {
        return (0, project_scraper_auth_1.resolveProjectWebpageScraperEngineId)(this.dataSources, projectId);
    }
    hasValidScraperSnapshot(projectId) {
        const snapshot = this.getLatestScraperSnapshot(projectId);
        if (!snapshot)
            return false;
        const lots = snapshot.lots;
        const current = snapshot.current;
        const auctionDisplay = snapshot.auctionDisplay;
        return ((Array.isArray(lots) && lots.length > 0) ||
            Boolean(current && typeof current === "object") ||
            Boolean(auctionDisplay && typeof auctionDisplay === "object"));
    }
    canExportCurrentWebpage(projectId) {
        return this.hasValidScraperSnapshot(projectId);
    }
    async exportCurrentWebpage(projectId, onProgress) {
        if (this.exportInProgress) {
            return { ok: false, error: "An offline export is already in progress." };
        }
        const validation = this.validateExportStart(projectId);
        if (!validation.ok) {
            return { ok: false, error: validation.error };
        }
        const operationId = (0, crypto_1.randomUUID)();
        const project = this.projects.getById(projectId);
        this.operationGeneration += 1;
        const operation = {
            operationId,
            projectId,
            projectSlug: project?.slug,
            generation: this.operationGeneration,
            status: "queued",
            phase: "preparing",
            percent: 0,
            message: "Preparing export…",
            completedLots: 0,
            totalLots: validation.tasks.length,
            completedUnits: 0,
            totalUnits: validation.tasks.length * 2,
            startedAt: new Date().toISOString(),
        };
        this.operations.set(operationId, operation);
        this.operationTrackers.set(operationId, (0, auction_export_progress_1.createAuctionExportProgressTracker)(validation.tasks.length));
        this.activeOperationId = operationId;
        this.exportInProgress = true;
        this.exportCancelled = false;
        const originalBroadcaster = this.progressBroadcaster;
        if (onProgress) {
            this.progressBroadcaster = (event) => {
                onProgress(event);
                originalBroadcaster?.(event);
            };
        }
        try {
            return await this.runExportOperation(operationId, projectId);
        }
        finally {
            this.progressBroadcaster = originalBroadcaster;
        }
    }
    async runExportOperation(operationId, projectId) {
        const validation = this.validateExportStart(projectId);
        if (!validation.ok) {
            this.applyTerminalPatch(operationId, {
                status: "failed",
                phase: "error",
                finishedAt: new Date().toISOString(),
                message: validation.error,
                error: validation.error,
                terminalEventSource: "startup",
            });
            this.exportInProgress = false;
            this.activeOperationId = null;
            return { ok: false, error: validation.error };
        }
        const { engineId, snapshot, tasks } = validation;
        const project = this.projects.getById(projectId);
        if (!project) {
            const error = "Project not found.";
            this.applyTerminalPatch(operationId, {
                status: "failed",
                phase: "error",
                finishedAt: new Date().toISOString(),
                message: error,
                error,
                terminalEventSource: "startup",
            });
            this.exportInProgress = false;
            this.activeOperationId = null;
            return { ok: false, error };
        }
        const tracker = this.operationTrackers.get(operationId) ??
            (0, auction_export_progress_1.createAuctionExportProgressTracker)(tasks.length);
        this.operationTrackers.set(operationId, tracker);
        const report = (input, status = "running") => {
            const progress = tracker.advance(input);
            this.updateOperation(operationId, {
                status,
                phase: progress.phase,
                percent: progress.percent,
                message: progress.message,
                completedLots: tracker.state.completedMetadataLots,
                totalLots: tracker.state.totalLots,
                completedUnits: tracker.state.completedPhotos,
                totalUnits: tracker.state.totalPhotos,
                currentLotNumber: tracker.state.currentLotNumber,
                currentPhotoIndex: tracker.state.currentPhotoIndex,
                currentPhotoTotal: tracker.state.totalPhotos,
                outputPath: progress.outputPath,
                error: progress.error,
            });
        };
        const packagePaths = (0, auction_data_paths_1.resolveUniqueBroadArrowExportPackage)(project.slug, project.name);
        const packageDir = packagePaths.packageDir;
        this.partialPackageByOperation.set(operationId, packageDir);
        try {
            this.updateOperation(operationId, {
                status: "preparing",
                totalLots: tasks.length,
                totalUnits: tasks.length * 2,
            });
            report({ phase: "preparing", message: "Preparing export…" }, "preparing");
            report({
                phase: "loading-scraper-data",
                message: `Loading scraper JSON for ${tasks.length} lots…`,
            });
            report({
                phase: "connecting-worker",
                message: "Connecting to running Webpage Scraper…",
            });
            report({
                phase: "preparing-export-page",
                message: "Preparing authenticated export page…",
            });
            const workerResult = (await this.engineManager.exportCurrentAuction(engineId, tasks, packageDir, {
                operationId,
                projectId,
                onQueued: (requestId) => {
                    this.updateOperation(operationId, { requestId });
                },
            }));
            const currentOperation = this.operations.get(operationId);
            if (this.exportCancelled || currentOperation?.status === "cancelled") {
                throw new Error("Export cancelled.");
            }
            if (workerResult?.cancelled) {
                throw new Error("Export cancelled.");
            }
            const { export: exportPayload, diagnostics } = (0, worker_auction_export_bridge_1.mergeWorkerExportIntoExportPayload)({
                snapshot,
                projectName: project.name,
                packagePaths,
                packageDir,
                localApiBaseUrl: this.localApiBaseUrl,
                workerResult,
            });
            report({ phase: "writing-package", message: "Writing timestamped JSON" });
            fs_1.default.writeFileSync(packagePaths.jsonPath, JSON.stringify(exportPayload, null, 2), "utf8");
            const manifest = {
                formatVersion: offline_auction_types_1.OFFLINE_AUCTION_FORMAT_VERSION,
                exportedAt: exportPayload.exportedAt,
                source: "webpage-scraper",
                jsonFileName: path_1.default.basename(packagePaths.jsonPath),
                auction: exportPayload.auction,
                activeLot: exportPayload.activeLot,
                lotCount: exportPayload.lotCount,
                imageCount: diagnostics.photosDownloaded,
                failedImages: exportPayload.photoDiscovery.failed.map((failure) => ({
                    lot: failure.lot,
                    url: failure.editUrl,
                    reason: failure.reason,
                })),
            };
            fs_1.default.writeFileSync(path_1.default.join(packageDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
            report({ phase: "writing-package", message: "Finalizing download package" });
            const finalPackageDir = (0, auction_data_paths_1.finalizeDownloadPackage)(packageDir);
            this.partialPackageByOperation.delete(operationId);
            const outputPath = path_1.default.join(finalPackageDir, path_1.default.basename(packagePaths.jsonPath));
            const packageId = path_1.default.basename(finalPackageDir);
            this.packages.set(packageId, {
                packageId,
                rootDir: finalPackageDir,
            });
            const warningParts = [];
            if (diagnostics.lotsFailed > 0) {
                warningParts.push(`${diagnostics.lotsFailed} lot error${diagnostics.lotsFailed === 1 ? "" : "s"}`);
            }
            if (diagnostics.photosFailed > 0) {
                warningParts.push(`${diagnostics.photosFailed} photo error${diagnostics.photosFailed === 1 ? "" : "s"}`);
            }
            const finalStatus = warningParts.length > 0 ? "completed-with-warnings" : "completed";
            report({
                terminal: "complete",
                message: finalStatus === "completed-with-warnings"
                    ? `Download Complete with Warnings${warningParts.length > 0 ? `: ${warningParts.join(" and ")}` : ""}`
                    : "Download Complete",
                completedMetadataLots: diagnostics.lotsTotal,
            }, finalStatus);
            this.applyTerminalPatch(operationId, {
                finishedAt: new Date().toISOString(),
                outputPath,
                terminalEventSource: "worker",
            });
            return { ok: true, outputPath, export: exportPayload };
        }
        catch (error) {
            const currentOperation = this.operations.get(operationId);
            if (currentOperation && this.isTerminalSuccess(currentOperation.status)) {
                return {
                    ok: true,
                    outputPath: currentOperation.outputPath ?? "",
                    export: {},
                };
            }
            if (currentOperation?.terminalEventSource === "worker" &&
                (currentOperation.status === "cancelled" || currentOperation.status === "failed")) {
                return {
                    ok: false,
                    error: currentOperation.error ?? (error instanceof Error ? error.message : "Export failed."),
                };
            }
            const mappedError = (0, worker_auction_export_bridge_1.mapWorkerExportError)(error, {
                engineManagerAttached: this.engineManager !== null,
                engineRunning: this.engineManager?.isEngineRunning(engineId) ?? false,
            });
            const finalStatus = this.exportCancelled
                ? "cancelled"
                : "failed";
            if (currentOperation?.workerAcceptedAt &&
                currentOperation.lastWorkerEventAt &&
                !this.exportCancelled) {
                return {
                    ok: false,
                    error: mappedError,
                };
            }
            this.applyTerminalPatch(operationId, {
                status: finalStatus,
                phase: "error",
                finishedAt: new Date().toISOString(),
                message: finalStatus === "cancelled" ? "Download cancelled" : mappedError,
                error: finalStatus === "cancelled" ? "Download cancelled" : mappedError,
                terminalEventSource: "startup",
            });
            if (finalStatus === "cancelled") {
                this.cleanupPartialPackage(operationId, "cancelled");
            }
            return {
                ok: false,
                error: mappedError,
            };
        }
        finally {
            this.exportInProgress = false;
            this.activeOperationId = null;
            this.exportCancelled = false;
            this.operationTrackers.delete(operationId);
        }
    }
    validatePackageDirectory(packageDir) {
        const manifestPath = path_1.default.join(packageDir, "manifest.json");
        const auctionDataPath = (0, auction_data_paths_1.resolveAuctionJsonPathInPackage)(packageDir);
        if (!auctionDataPath) {
            return { ok: false, error: "Package must include a recognizable auction JSON file." };
        }
        let manifest;
        let auctionData;
        try {
            if (fs_1.default.existsSync(manifestPath)) {
                manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, "utf8"));
            }
            else {
                auctionData = JSON.parse(fs_1.default.readFileSync(auctionDataPath, "utf8"));
                manifest = {
                    formatVersion: offline_auction_types_1.OFFLINE_AUCTION_FORMAT_VERSION,
                    exportedAt: auctionData.exportedAt ?? new Date().toISOString(),
                    source: "webpage-scraper",
                    jsonFileName: path_1.default.basename(auctionDataPath),
                    auction: { name: "Broad Arrow Auctions" },
                    lotCount: Array.isArray(auctionData.lots) ? auctionData.lots.length : 0,
                    imageCount: 0,
                    failedImages: [],
                };
                return { ok: true, manifest, auctionData };
            }
            auctionData = JSON.parse(fs_1.default.readFileSync(auctionDataPath, "utf8"));
        }
        catch {
            return { ok: false, error: "Package JSON is invalid." };
        }
        if (manifest.formatVersion !== offline_auction_types_1.OFFLINE_AUCTION_FORMAT_VERSION) {
            return { ok: false, error: "Unsupported offline package format version." };
        }
        if (!Array.isArray(auctionData.lots) || auctionData.lots.length === 0) {
            return { ok: false, error: "Offline package does not include auction lots." };
        }
        return { ok: true, manifest, auctionData };
    }
    validateJsonExport(filePath) {
        try {
            const parsed = JSON.parse(fs_1.default.readFileSync(filePath, "utf8"));
            if (parsed.formatVersion !== offline_auction_types_1.OFFLINE_AUCTION_FORMAT_VERSION) {
                return { ok: false, error: "Unsupported auction JSON format version." };
            }
            if (!Array.isArray(parsed.lots) || parsed.lots.length === 0) {
                return { ok: false, error: "Auction JSON does not include lots." };
            }
            const auctionData = {
                exportedAt: parsed.exportedAt,
                sourceUrl: parsed.auction.sourceUrl,
                scrapedAt: parsed.scrape.scrapedAt,
                activeLot: parsed.activeLot,
                lots: parsed.lots,
                current: parsed.lots.find((lot) => readLotNumber(lot) === parsed.activeLot) ?? null,
                updatedAt: parsed.exportedAt,
            };
            return { ok: true, export: parsed, auctionData };
        }
        catch {
            return { ok: false, error: "Auction JSON is invalid." };
        }
    }
    loadPackageFromDirectory(projectId, packageDir) {
        const validated = this.validatePackageDirectory(packageDir);
        if (!validated.ok) {
            return validated;
        }
        const packageId = (0, crypto_1.randomUUID)();
        const registeredDir = path_1.default.join(this.paths.data, "offline-packages", packageId);
        fs_1.default.mkdirSync(path_1.default.dirname(registeredDir), { recursive: true });
        fs_1.default.cpSync(packageDir, registeredDir, { recursive: true });
        this.packages.set(packageId, { packageId, rootDir: registeredDir });
        const auctionData = this.rewriteAuctionDataAssetUrls(validated.auctionData, packageId);
        return {
            ok: true,
            packageId,
            lotCount: validated.manifest.lotCount,
            auctionData,
        };
    }
    loadJsonExport(_projectId, filePath) {
        const validated = this.validateJsonExport(filePath);
        if (!validated.ok) {
            return validated;
        }
        const packageDir = path_1.default.dirname(filePath);
        const packageId = path_1.default.basename(packageDir);
        this.packages.set(packageId, {
            packageId,
            rootDir: packageDir,
        });
        const auctionData = this.rewriteAuctionDataAssetUrls(validated.auctionData, packageId);
        return {
            ok: true,
            lotCount: validated.export.lotCount,
            packageId,
            auctionData,
        };
    }
    getLotThumbnailsFromDataset(dataset, lotNumber, packageId) {
        const lot = this.findLotInDataset(dataset, lotNumber);
        const buildLocalAssetUrl = packageId
            ? (relativePath) => this.buildAssetUrl(packageId, relativePath)
            : undefined;
        return (0, lot_thumbnail_service_1.normalizeLotThumbnailPhotos)(lot, buildLocalAssetUrl);
    }
    getLotDetailsFromDataset(dataset, lotNumber) {
        const lot = this.findLotInDataset(dataset, lotNumber);
        if (!lot)
            return null;
        const title = (0, bag_manual_validation_1.formatManualLotTitle)(lot);
        if (!title)
            return null;
        const canonical = (0, reserve_status_1.readReserveStatusFromRecord)(lot);
        const reserveStatus = (0, reserve_status_1.resolveReserveStatusDisplayLabel)(canonical !== "unknown" ? canonical : lot.reserveStatus) || "Unknown";
        return { title, reserveStatus };
    }
    findLotInDataset(dataset, lotNumber) {
        const lots = Array.isArray(dataset?.lots)
            ? dataset.lots
            : [];
        const normalized = lotNumber.replace(/^lot\s+/i, "").trim();
        if (!normalized)
            return null;
        return (lots.find((entry) => readLotNumber(entry) === normalized) ??
            lots.find((entry) => readLotNumber(entry).toLowerCase() === normalized.toLowerCase()) ??
            null);
    }
    loadPackageFromZip(_projectId, _zipPath) {
        return { ok: false, error: "Load package from ZIP is not supported yet. Extract the package first." };
    }
    buildAssetUrl(packageId, relativePath) {
        const encoded = relativePath
            .split("/")
            .map((segment) => encodeURIComponent(segment))
            .join("/");
        return `${this.localApiBaseUrl}/api/offline-assets/${encodeURIComponent(packageId)}/${encoded}`;
    }
    rewriteAuctionDataAssetUrls(auctionData, packageId) {
        const clone = JSON.parse(JSON.stringify(auctionData));
        const rewriteLot = (lot) => {
            if (!lot)
                return;
            if (Array.isArray(lot.photos)) {
                lot.photoSources = lot.photos.map((photo) => typeof photo === "string"
                    ? photo
                    : photo.sourceUrl ?? photo.relativePath ?? photo.localPath ?? "");
                lot.photos = lot.photos.map((photo) => {
                    if (typeof photo === "string") {
                        return photo.startsWith("photos/") || photo.startsWith("images/")
                            ? this.buildAssetUrl(packageId, photo)
                            : photo;
                    }
                    if (photo.relativePath || photo.localPath) {
                        const relativePath = photo.relativePath ?? photo.localPath ?? "";
                        return {
                            ...photo,
                            displayUrl: this.buildAssetUrl(packageId, relativePath),
                        };
                    }
                    return photo;
                });
            }
            if (typeof lot.imageUrl === "string" && lot.imageUrl.startsWith("images/")) {
                lot.imageUrl = this.buildAssetUrl(packageId, lot.imageUrl);
            }
        };
        rewriteLot(clone.auctionDisplay ?? null);
        rewriteLot(clone.current ?? null);
        rewriteLot(clone.prev ?? null);
        rewriteLot(clone.lastSold ?? null);
        for (const lot of clone.next ?? [])
            rewriteLot(lot);
        for (const lot of clone.lots ?? [])
            rewriteLot(lot);
        return clone;
    }
    loadRegisteredPackages() {
        const root = path_1.default.join(this.paths.data, "offline-packages");
        if (!fs_1.default.existsSync(root))
            return;
        for (const entry of fs_1.default.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            const packageDir = path_1.default.join(root, entry.name);
            if (fs_1.default.existsSync(path_1.default.join(packageDir, "auction-data.json"))) {
                this.packages.set(entry.name, { packageId: entry.name, rootDir: packageDir });
            }
        }
    }
}
exports.OfflineAuctionExportService = OfflineAuctionExportService;
function defaultOfflineExportFileName() {
    return "auction-data.json";
}
