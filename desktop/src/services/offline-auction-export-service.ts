import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { AppPaths } from "./app-paths";
import type { CredentialStore } from "./credential-store";
import type { DataSourcesRepository } from "../repositories/data-sources-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import {
  OFFLINE_AUCTION_FORMAT_VERSION,
  type OfflineAuctionData,
  type OfflineAuctionJsonExport,
  type OfflineAuctionLot,
  type OfflineAuctionManifest,
  type OfflineExportProgress,
  type OfflineExportResult,
  type OfflineLoadResult,
  type OfflinePhotoReference,
} from "./offline-auction-types";
import {
  readReserveStatusFromRecord,
  resolveReserveStatusDisplayLabel,
} from "../bag/reserve-status";
import {
  resolveUniqueBroadArrowExportPackage,
  finalizeDownloadPackage,
  resolveAuctionJsonPathInPackage,
} from "./auction-data-paths";
import {
  createAuctionExportProgressTracker,
  type AuctionExportProgressTracker,
} from "./auction-export-progress";
import type { ExportWorkerProgressPayload } from "./export-worker-events";
import { normalizeLotThumbnailPhotos } from "./lot-thumbnail-service";
import { formatManualLotTitle } from "../bag/live-state/bag-manual-validation";
import type { EngineManager } from "./engine-manager";
import {
  buildWorkerExportTasks,
  mapWorkerExportError,
  mergeWorkerExportIntoExportPayload,
  WORKER_EXPORT_ERRORS,
  type WorkerExportResult,
} from "./worker-auction-export-bridge";
import {
  isActiveWebpageExportStatus,
  operationToProgressEvent,
  type WebpageExportOperation,
  type WebpageExportProgressEvent,
  type WebpageExportTerminalEventSource,
} from "./webpage-export-operations";
import { resolveProjectWebpageScraperEngineId } from "./project-scraper-auth";

type RegisteredOfflinePackage = {
  packageId: string;
  rootDir: string;
};

type ExportCompletionHandler = (input: {
  projectId: string;
  operationId: string;
  result: OfflineExportResult;
}) => void | Promise<void>;

function readLotNumber(lot: OfflineAuctionLot | null | undefined): string {
  if (!lot) return "";
  const raw = lot.lotNumber ?? lot.lot ?? "";
  return raw.replace(/^lot\s+/i, "").trim();
}


export class OfflineAuctionExportService {
  private readonly packages = new Map<string, RegisteredOfflinePackage>();
  private readonly operations = new Map<string, WebpageExportOperation>();
  private readonly operationTrackers = new Map<string, AuctionExportProgressTracker>();
  private readonly partialPackageByOperation = new Map<string, string>();
  private exportInProgress = false;
  private exportCancelled = false;
  private engineManager: EngineManager | null = null;
  private activeOperationId: string | null = null;
  private operationGeneration = 0;
  private progressBroadcaster: ((event: WebpageExportProgressEvent) => void) | null = null;
  private completionHandler: ExportCompletionHandler | null = null;
  private lastProgressEmitAt = 0;

  constructor(
    private readonly paths: AppPaths,
    private readonly projects: ProjectsRepository,
    private readonly dataSources: DataSourcesRepository,
    private readonly credentials: CredentialStore,
    private readonly localApiBaseUrl: string,
  ) {
    this.loadRegisteredPackages();
  }

  attachEngineManager(engineManager: EngineManager): void {
    this.engineManager = engineManager;
  }

  handleWorkerEvent(payload: ExportWorkerProgressPayload): void {
    const operation = this.operations.get(payload.operationId);
    if (!operation) return;
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

  cancelCurrentWebpageDownload(operationId: string): { ok: true } | { ok: false; error: string } {
    const operation = this.operations.get(operationId);
    if (!operation) {
      return { ok: false, error: "Download operation was not found." };
    }
    if (!isActiveWebpageExportStatus(operation.status)) {
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

  setProgressBroadcaster(
    broadcaster: (event: WebpageExportProgressEvent) => void,
  ): void {
    this.progressBroadcaster = broadcaster;
  }

  setExportCompletionHandler(handler: ExportCompletionHandler): void {
    this.completionHandler = handler;
  }

  getCurrentWebpageExportOperation(projectId: string): WebpageExportOperation | null {
    let latest: WebpageExportOperation | null = null;
    for (const operation of this.operations.values()) {
      if (operation.projectId !== projectId) continue;
      if (!latest || operation.startedAt > latest.startedAt) {
        latest = operation;
      }
    }
    return latest ? this.resolvePresentedExportOperation(latest) : null;
  }

  dismissCurrentWebpageExportOperation(
    projectId: string,
    operationId: string,
  ): { ok: true } | { ok: false; error: string } {
    const operation = this.operations.get(operationId);
    if (!operation || operation.projectId !== projectId) {
      return { ok: false, error: "Download operation was not found." };
    }
    if (isActiveWebpageExportStatus(operation.status)) {
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

  private resolvePresentedExportOperation(
    operation: WebpageExportOperation,
  ): WebpageExportOperation | null {
    if (isActiveWebpageExportStatus(operation.status)) {
      return operation;
    }
    if (operation.presentationDismissedAt) {
      return null;
    }
    if (
      (operation.status === "completed" || operation.status === "cancelled") &&
      operation.dismissAfter &&
      Date.now() >= Date.parse(operation.dismissAfter)
    ) {
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
    if (
      operation.status === "completed" ||
      operation.status === "completed-with-warnings" ||
      operation.status === "failed" ||
      operation.status === "cancelled"
    ) {
      return operation;
    }
    return null;
  }

  listCurrentWebpageExportOperations(): WebpageExportOperation[] {
    return [...this.operations.values()].sort((left, right) =>
      right.startedAt.localeCompare(left.startedAt),
    );
  }

  isExportInProgressForProject(projectId: string): boolean {
    const operation = this.getCurrentWebpageExportOperation(projectId);
    return operation ? isActiveWebpageExportStatus(operation.status) : false;
  }

  startExportCurrentWebpage(
    projectId: string,
  ):
    | { ok: true; operationId: string; alreadyRunning?: boolean }
    | { ok: false; error: string } {
    const active = this.getActiveOperation();
    if (active && isActiveWebpageExportStatus(active.status)) {
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

    const operationId = randomUUID();
    const project = this.projects.getById(projectId);
    this.operationGeneration += 1;
    const presented = this.getCurrentWebpageExportOperation(projectId);
    if (presented?.status === "completed") {
      this.dismissCurrentWebpageExportOperation(projectId, presented.operationId);
    }
    const operation: WebpageExportOperation = {
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
    this.operationTrackers.set(operationId, createAuctionExportProgressTracker(validation.tasks.length));
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

  cancelActiveExportForShutdown(): void {
    this.exportCancelled = true;
    if (this.activeOperationId) {
      const operation = this.operations.get(this.activeOperationId);
      if (operation && isActiveWebpageExportStatus(operation.status)) {
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

  isExportInProgress(): boolean {
    return this.exportInProgress;
  }

  private getActiveOperation(): WebpageExportOperation | null {
    if (!this.activeOperationId) return null;
    return this.operations.get(this.activeOperationId) ?? null;
  }

  private publishOperationProgress(operation: WebpageExportOperation): void {
    this.progressBroadcaster?.(operationToProgressEvent(operation));
  }

  private isTerminalSuccess(status: WebpageExportOperation["status"]): boolean {
    return status === "completed" || status === "completed-with-warnings";
  }

  private isTerminalState(status: WebpageExportOperation["status"]): boolean {
    return (
      this.isTerminalSuccess(status) ||
      status === "failed" ||
      status === "cancelled"
    );
  }

  private applyWorkerLifecyclePatch(
    operationId: string,
    patch: Partial<WebpageExportOperation>,
  ): void {
    const current = this.operations.get(operationId);
    if (!current || this.isTerminalState(current.status)) {
      return;
    }
    this.updateOperation(operationId, patch);
  }

  private applyTerminalPatch(
    operationId: string,
    patch: Partial<WebpageExportOperation> & { terminalEventSource: WebpageExportTerminalEventSource },
  ): void {
    const current = this.operations.get(operationId);
    if (!current) return;
    if (this.isTerminalSuccess(current.status)) {
      return;
    }
    if (
      current.terminalEventSource === "worker" &&
      patch.status === "failed" &&
      patch.terminalEventSource !== "worker"
    ) {
      return;
    }
    this.updateOperation(operationId, patch);
  }

  private applyWorkerProgress(
    operationId: string,
    payload: ExportWorkerProgressPayload,
  ): void {
    const current = this.operations.get(operationId);
    if (!current || this.isTerminalState(current.status)) {
      return;
    }

    let tracker = this.operationTrackers.get(operationId);
    if (!tracker) {
      tracker = createAuctionExportProgressTracker(payload.totalLots ?? current.totalLots);
      this.operationTrackers.set(operationId, tracker);
    }

    tracker.advance({
      phase:
        payload.progressPhase === "metadata"
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

  private cleanupPartialPackage(operationId: string, reason: "cancelled" | "failed"): void {
    const packageDir = this.partialPackageByOperation.get(operationId);
    if (!packageDir || !fs.existsSync(packageDir)) {
      return;
    }
    try {
      fs.rmSync(packageDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup after worker-confirmed terminal state.
    } finally {
      this.partialPackageByOperation.delete(operationId);
    }
    void reason;
  }

  private updateOperation(
    operationId: string,
    patch: Partial<WebpageExportOperation>,
  ): void {
    const current = this.operations.get(operationId);
    if (!current) return;

    const now = Date.now();
    const shouldThrottle =
      patch.status === "running" &&
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

  private validateExportStart(
    projectId: string,
  ): { ok: true; engineId: string; snapshot: Record<string, unknown>; tasks: ReturnType<typeof buildWorkerExportTasks> }
    | { ok: false; error: string } {
    const project = this.projects.getById(projectId);
    if (!project) {
      return { ok: false, error: "Project not found." };
    }

    const snapshot = this.getLatestScraperSnapshot(projectId);
    if (!snapshot) {
      return { ok: false, error: WORKER_EXPORT_ERRORS.NO_SNAPSHOT };
    }

    const engineId = this.getWebpageScraperEngineId(projectId);
    if (!engineId) {
      return { ok: false, error: "Webpage Scraper engine is not configured for this project." };
    }

    if (!this.engineManager) {
      return { ok: false, error: WORKER_EXPORT_ERRORS.WORKER_MISSING };
    }

    const engineRunning = this.engineManager.isEngineRunning(engineId);
    if (!engineRunning) {
      return { ok: false, error: WORKER_EXPORT_ERRORS.SCRAPER_STOPPED };
    }

    const tasks = buildWorkerExportTasks(snapshot, this.dataSources, engineId);
    if (tasks.length === 0) {
      return { ok: false, error: WORKER_EXPORT_ERRORS.NO_SNAPSHOT };
    }

    return { ok: true, engineId, snapshot, tasks };
  }

  getRegisteredPackage(packageId: string): RegisteredOfflinePackage | null {
    return this.packages.get(packageId) ?? null;
  }

  resolveAssetPath(packageId: string, relativePath: string): string | null {
    const registered = this.packages.get(packageId);
    if (!registered) return null;

    const normalized = path
      .normalize(relativePath.replace(/\\/g, "/"))
      .replace(/^(\.\.(\/|\\|$))+/, "");
    if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
      return null;
    }

    const absolutePath = path.join(registered.rootDir, normalized);
    const relative = path.relative(registered.rootDir, absolutePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return null;
    }
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      return null;
    }
    return absolutePath;
  }

  getLatestScraperSnapshot(projectId: string): Record<string, unknown> | null {
    const engineId = resolveProjectWebpageScraperEngineId(this.dataSources, projectId);
    if (engineId) {
      const snapshot = this.dataSources.getLatestSnapshot(engineId);
      if (snapshot?.data && typeof snapshot.data === "object") {
        return snapshot.data as Record<string, unknown>;
      }
    }

    const engines = this.dataSources.listByProject(projectId);
    for (const engine of engines) {
      const snapshot = this.dataSources.getLatestSnapshot(engine.id);
      if (snapshot?.data && typeof snapshot.data === "object") {
        return snapshot.data as Record<string, unknown>;
      }
    }
    return null;
  }

  getWebpageScraperEngineId(projectId: string): string | null {
    return resolveProjectWebpageScraperEngineId(this.dataSources, projectId);
  }

  hasValidScraperSnapshot(projectId: string): boolean {
    const snapshot = this.getLatestScraperSnapshot(projectId);
    if (!snapshot) return false;
    const lots = snapshot.lots;
    const current = snapshot.current;
    const auctionDisplay = snapshot.auctionDisplay;
    return (
      (Array.isArray(lots) && lots.length > 0) ||
      Boolean(current && typeof current === "object") ||
      Boolean(auctionDisplay && typeof auctionDisplay === "object")
    );
  }

  canExportCurrentWebpage(projectId: string): boolean {
    return this.hasValidScraperSnapshot(projectId);
  }

  async exportCurrentWebpage(
    projectId: string,
    onProgress?: (progress: OfflineExportProgress) => void,
  ): Promise<OfflineExportResult> {
    if (this.exportInProgress) {
      return { ok: false, error: "An offline export is already in progress." };
    }

    const validation = this.validateExportStart(projectId);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }

    const operationId = randomUUID();
    const project = this.projects.getById(projectId);
    this.operationGeneration += 1;
    const operation: WebpageExportOperation = {
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
    this.operationTrackers.set(operationId, createAuctionExportProgressTracker(validation.tasks.length));
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
    } finally {
      this.progressBroadcaster = originalBroadcaster;
    }
  }

  private async runExportOperation(
    operationId: string,
    projectId: string,
  ): Promise<OfflineExportResult> {
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

    const tracker =
      this.operationTrackers.get(operationId) ??
      createAuctionExportProgressTracker(tasks.length);
    this.operationTrackers.set(operationId, tracker);

    const report = (
      input: Parameters<AuctionExportProgressTracker["advance"]>[0],
      status: WebpageExportOperation["status"] = "running",
    ) => {
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

    const packagePaths = resolveUniqueBroadArrowExportPackage(project.slug, project.name);
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

      const workerResult = (await this.engineManager!.exportCurrentAuction(
        engineId,
        tasks,
        packageDir,
        {
          operationId,
          projectId,
          onQueued: (requestId) => {
            this.updateOperation(operationId, { requestId });
          },
        },
      )) as WorkerExportResult;

      const currentOperation = this.operations.get(operationId);
      if (this.exportCancelled || currentOperation?.status === "cancelled") {
        throw new Error("Export cancelled.");
      }
      if (workerResult?.cancelled) {
        throw new Error("Export cancelled.");
      }

      const { export: exportPayload, diagnostics } = mergeWorkerExportIntoExportPayload({
        snapshot,
        projectName: project.name,
        packagePaths,
        packageDir,
        localApiBaseUrl: this.localApiBaseUrl,
        workerResult,
      });

      report({ phase: "writing-package", message: "Writing timestamped JSON" });
      fs.writeFileSync(packagePaths.jsonPath, JSON.stringify(exportPayload, null, 2), "utf8");

      const manifest: OfflineAuctionManifest = {
        formatVersion: OFFLINE_AUCTION_FORMAT_VERSION,
        exportedAt: exportPayload.exportedAt,
        source: "webpage-scraper",
        jsonFileName: path.basename(packagePaths.jsonPath),
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
      fs.writeFileSync(
        path.join(packageDir, "manifest.json"),
        JSON.stringify(manifest, null, 2),
        "utf8",
      );

      report({ phase: "writing-package", message: "Finalizing download package" });
      const finalPackageDir = finalizeDownloadPackage(packageDir);
      this.partialPackageByOperation.delete(operationId);
      const outputPath = path.join(finalPackageDir, path.basename(packagePaths.jsonPath));
      const packageId = path.basename(finalPackageDir);

      this.packages.set(packageId, {
        packageId,
        rootDir: finalPackageDir,
      });

      const warningParts: string[] = [];
      if (diagnostics.lotsFailed > 0) {
        warningParts.push(
          `${diagnostics.lotsFailed} lot error${diagnostics.lotsFailed === 1 ? "" : "s"}`,
        );
      }
      if (diagnostics.photosFailed > 0) {
        warningParts.push(
          `${diagnostics.photosFailed} photo error${diagnostics.photosFailed === 1 ? "" : "s"}`,
        );
      }

      const finalStatus: WebpageExportOperation["status"] =
        warningParts.length > 0 ? "completed-with-warnings" : "completed";

      report(
        {
          terminal: "complete",
          message:
            finalStatus === "completed-with-warnings"
              ? `Download Complete with Warnings${warningParts.length > 0 ? `: ${warningParts.join(" and ")}` : ""}`
              : "Download Complete",
          completedMetadataLots: diagnostics.lotsTotal,
        },
        finalStatus,
      );
      this.applyTerminalPatch(operationId, {
        finishedAt: new Date().toISOString(),
        outputPath,
        terminalEventSource: "worker",
      });

      return { ok: true, outputPath, export: exportPayload };
    } catch (error) {
      const currentOperation = this.operations.get(operationId);
      if (currentOperation && this.isTerminalSuccess(currentOperation.status)) {
        return {
          ok: true,
          outputPath: currentOperation.outputPath ?? "",
          export: {} as OfflineAuctionJsonExport,
        };
      }

      if (
        currentOperation?.terminalEventSource === "worker" &&
        (currentOperation.status === "cancelled" || currentOperation.status === "failed")
      ) {
        return {
          ok: false,
          error: currentOperation.error ?? (error instanceof Error ? error.message : "Export failed."),
        };
      }

      const mappedError = mapWorkerExportError(error, {
        engineManagerAttached: this.engineManager !== null,
        engineRunning: this.engineManager?.isEngineRunning(engineId) ?? false,
      });

      const finalStatus: WebpageExportOperation["status"] = this.exportCancelled
        ? "cancelled"
        : "failed";

      if (
        currentOperation?.workerAcceptedAt &&
        currentOperation.lastWorkerEventAt &&
        !this.exportCancelled
      ) {
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
    } finally {
      this.exportInProgress = false;
      this.activeOperationId = null;
      this.exportCancelled = false;
      this.operationTrackers.delete(operationId);
    }
  }

  validatePackageDirectory(packageDir: string): {
    ok: true;
    manifest: OfflineAuctionManifest;
    auctionData: OfflineAuctionData;
  } | { ok: false; error: string } {
    const manifestPath = path.join(packageDir, "manifest.json");
    const auctionDataPath = resolveAuctionJsonPathInPackage(packageDir);

    if (!auctionDataPath) {
      return { ok: false, error: "Package must include a recognizable auction JSON file." };
    }

    let manifest: OfflineAuctionManifest;
    let auctionData: OfflineAuctionData;
    try {
      if (fs.existsSync(manifestPath)) {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as OfflineAuctionManifest;
      } else {
        auctionData = JSON.parse(fs.readFileSync(auctionDataPath, "utf8")) as OfflineAuctionData;
        manifest = {
          formatVersion: OFFLINE_AUCTION_FORMAT_VERSION,
          exportedAt: auctionData.exportedAt ?? new Date().toISOString(),
          source: "webpage-scraper",
          jsonFileName: path.basename(auctionDataPath),
          auction: { name: "Broad Arrow Auctions" },
          lotCount: Array.isArray(auctionData.lots) ? auctionData.lots.length : 0,
          imageCount: 0,
          failedImages: [],
        };
        return { ok: true, manifest, auctionData };
      }
      auctionData = JSON.parse(fs.readFileSync(auctionDataPath, "utf8")) as OfflineAuctionData;
    } catch {
      return { ok: false, error: "Package JSON is invalid." };
    }

    if (manifest.formatVersion !== OFFLINE_AUCTION_FORMAT_VERSION) {
      return { ok: false, error: "Unsupported offline package format version." };
    }

    if (!Array.isArray(auctionData.lots) || auctionData.lots.length === 0) {
      return { ok: false, error: "Offline package does not include auction lots." };
    }

    return { ok: true, manifest, auctionData };
  }

  validateJsonExport(filePath: string):
    | { ok: true; export: OfflineAuctionJsonExport; auctionData: OfflineAuctionData }
    | { ok: false; error: string } {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as OfflineAuctionJsonExport;
      if (parsed.formatVersion !== OFFLINE_AUCTION_FORMAT_VERSION) {
        return { ok: false, error: "Unsupported auction JSON format version." };
      }
      if (!Array.isArray(parsed.lots) || parsed.lots.length === 0) {
        return { ok: false, error: "Auction JSON does not include lots." };
      }

      const auctionData: OfflineAuctionData = {
        exportedAt: parsed.exportedAt,
        sourceUrl: parsed.auction.sourceUrl,
        scrapedAt: parsed.scrape.scrapedAt,
        activeLot: parsed.activeLot,
        lots: parsed.lots,
        current: parsed.lots.find((lot) => readLotNumber(lot) === parsed.activeLot) ?? null,
        updatedAt: parsed.exportedAt,
      };

      return { ok: true, export: parsed, auctionData };
    } catch {
      return { ok: false, error: "Auction JSON is invalid." };
    }
  }

  loadPackageFromDirectory(
    projectId: string,
    packageDir: string,
  ): OfflineLoadResult & { auctionData?: OfflineAuctionData; packageId?: string } {
    const validated = this.validatePackageDirectory(packageDir);
    if (!validated.ok) {
      return validated;
    }

    const packageId = randomUUID();
    const registeredDir = path.join(this.paths.data, "offline-packages", packageId);
    fs.mkdirSync(path.dirname(registeredDir), { recursive: true });
    fs.cpSync(packageDir, registeredDir, { recursive: true });
    this.packages.set(packageId, { packageId, rootDir: registeredDir });

    const auctionData = this.rewriteAuctionDataAssetUrls(
      validated.auctionData,
      packageId,
    );

    return {
      ok: true,
      packageId,
      lotCount: validated.manifest.lotCount,
      auctionData,
    };
  }

  loadJsonExport(
    _projectId: string,
    filePath: string,
  ): OfflineLoadResult & { auctionData?: OfflineAuctionData; packageId?: string } {
    const validated = this.validateJsonExport(filePath);
    if (!validated.ok) {
      return validated;
    }

    const packageDir = path.dirname(filePath);
    const packageId = path.basename(packageDir);
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

  getLotThumbnailsFromDataset(
    dataset: Record<string, unknown> | null,
    lotNumber: string,
    packageId?: string | null,
  ) {
    const lot = this.findLotInDataset(dataset, lotNumber);

    const buildLocalAssetUrl = packageId
      ? (relativePath: string) => this.buildAssetUrl(packageId, relativePath)
      : undefined;

    return normalizeLotThumbnailPhotos(lot, buildLocalAssetUrl);
  }

  getLotDetailsFromDataset(
    dataset: Record<string, unknown> | null,
    lotNumber: string,
  ): { title: string; reserveStatus: string } | null {
    const lot = this.findLotInDataset(dataset, lotNumber);
    if (!lot) return null;
    const title = formatManualLotTitle(lot);
    if (!title) return null;
    const canonical = readReserveStatusFromRecord(lot as Record<string, unknown>);
    const reserveStatus =
      resolveReserveStatusDisplayLabel(
        canonical !== "unknown" ? canonical : lot.reserveStatus,
      ) || "Unknown";
    return { title, reserveStatus };
  }

  findLotInDataset(
    dataset: Record<string, unknown> | null,
    lotNumber: string,
  ): OfflineAuctionLot | null {
    const lots = Array.isArray(dataset?.lots)
      ? (dataset.lots as OfflineAuctionLot[])
      : [];
    const normalized = lotNumber.replace(/^lot\s+/i, "").trim();
    if (!normalized) return null;

    return (
      lots.find((entry) => readLotNumber(entry) === normalized) ??
      lots.find(
        (entry) => readLotNumber(entry).toLowerCase() === normalized.toLowerCase(),
      ) ??
      null
    );
  }

  loadPackageFromZip(_projectId: string, _zipPath: string): OfflineLoadResult & {
    auctionData?: OfflineAuctionData;
    packageId?: string;
  } {
    return { ok: false, error: "Load package from ZIP is not supported yet. Extract the package first." };
  }

  buildAssetUrl(packageId: string, relativePath: string): string {
    const encoded = relativePath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return `${this.localApiBaseUrl}/api/offline-assets/${encodeURIComponent(packageId)}/${encoded}`;
  }

  rewriteAuctionDataAssetUrls(
    auctionData: OfflineAuctionData,
    packageId: string,
  ): OfflineAuctionData {
    const clone = JSON.parse(JSON.stringify(auctionData)) as OfflineAuctionData;

    const rewriteLot = (lot: OfflineAuctionLot | null | undefined) => {
      if (!lot) return;
      if (Array.isArray(lot.photos)) {
        lot.photoSources = lot.photos.map((photo) =>
          typeof photo === "string"
            ? photo
            : photo.sourceUrl ?? photo.relativePath ?? photo.localPath ?? "",
        );
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
            } satisfies OfflinePhotoReference;
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
    for (const lot of clone.next ?? []) rewriteLot(lot);
    for (const lot of clone.lots ?? []) rewriteLot(lot);

    return clone;
  }

  private loadRegisteredPackages() {
    const root = path.join(this.paths.data, "offline-packages");
    if (!fs.existsSync(root)) return;

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packageDir = path.join(root, entry.name);
      if (
        fs.existsSync(path.join(packageDir, "auction-data.json"))
      ) {
        this.packages.set(entry.name, { packageId: entry.name, rootDir: packageDir });
      }
    }
  }
}

export function defaultOfflineExportFileName(): string {
  return "auction-data.json";
}
