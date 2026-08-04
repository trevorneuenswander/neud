import path from "path";
import { BrowserWindow, dialog, shell } from "electron";
import type { AuctionDatasetService } from "../services/auction-dataset-service";
import {
  getAuctionDataDirectory,
  getProjectAuctionDataDirectory,
  resolveAuctionJsonPathInPackage,
} from "../services/auction-data-paths";
import type { LocalDataService } from "../services/local-data-service";
import type { OfflineAuctionExportService } from "../services/offline-auction-export-service";
import type { OfflineExportProgress } from "../services/offline-auction-types";
import type { WebpageExportProgressEvent } from "../services/webpage-export-operations";
import { broadcastToAllRenderers, registerIpcHandler, sendToRenderer } from "./channels";

function getSenderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window && !window.isDestroyed() ? window : null;
}

function pushProgress(window: BrowserWindow | null, payload: OfflineExportProgress) {
  if (!window || window.isDestroyed()) return;
  sendToRenderer(window, "neud:offline:progress", payload);
}

function broadcastExportProgress(payload: WebpageExportProgressEvent) {
  broadcastToAllRenderers("neud:offline:progress", payload);
}

export function registerOfflineAuctionIpc(deps: {
  data: LocalDataService;
  offlineAuction: OfflineAuctionExportService;
  auctionDataset: AuctionDatasetService;
}) {
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
        message: `Auction package completed: ${path.basename(path.dirname(result.outputPath))}`,
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
        message: `Active auction dataset set to ${datasetReference.filename ?? path.basename(result.outputPath)}`,
        metadata: {
          filePath: result.outputPath,
          source: datasetReference.source,
        },
      });
    }
  });

  registerIpcHandler("neud:offline:hasValidScrape", (_event, projectId: unknown) => {
    if (typeof projectId !== "string" || !projectId.trim()) {
      return false;
    }
    return deps.offlineAuction.canExportCurrentWebpage(projectId);
  });

  registerIpcHandler("neud:offline:isExportInProgress", (_event, projectId: unknown) => {
    if (typeof projectId === "string" && projectId.trim()) {
      return deps.offlineAuction.isExportInProgressForProject(projectId);
    }
    return deps.offlineAuction.isExportInProgress();
  });

  registerIpcHandler("neud:offline:getExportOperation", (_event, projectId: unknown) => {
    if (typeof projectId !== "string" || !projectId.trim()) {
      return null;
    }
    return deps.offlineAuction.getCurrentWebpageExportOperation(projectId);
  });

  registerIpcHandler("neud:offline:listExportOperations", () => {
    return deps.offlineAuction.listCurrentWebpageExportOperations();
  });

  registerIpcHandler("neud:offline:getActiveDataset", (_event, projectId: unknown) => {
    if (typeof projectId !== "string" || !projectId.trim()) {
      return null;
    }
    return deps.data.getActiveAuctionDatasetDisplay(projectId);
  });

  registerIpcHandler("neud:offline:getActiveDownloadedDataset", (_event, projectId: unknown) => {
    if (typeof projectId !== "string" || !projectId.trim()) {
      return null;
    }
    return deps.data.getActiveDownloadedDataset(projectId);
  });

  registerIpcHandler(
    "neud:offline:dismissExportOperation",
    (_event, payload: unknown) => {
      if (
        !payload ||
        typeof payload !== "object" ||
        typeof (payload as { projectId?: unknown }).projectId !== "string" ||
        typeof (payload as { operationId?: unknown }).operationId !== "string"
      ) {
        return { ok: false, error: "Project id and operation id are required." };
      }
      const { projectId, operationId } = payload as {
        projectId: string;
        operationId: string;
      };
      return deps.offlineAuction.dismissCurrentWebpageExportOperation(projectId, operationId);
    },
  );

  registerIpcHandler("neud:offline:getLotThumbnailPhotos", (_event, payload: unknown) => {
    if (
      !payload ||
      typeof payload !== "object" ||
      typeof (payload as { projectId?: unknown }).projectId !== "string" ||
      typeof (payload as { lotNumber?: unknown }).lotNumber !== "string"
    ) {
      return [];
    }
    const { projectId, lotNumber } = payload as { projectId: string; lotNumber: string };
    return deps.data.getLotThumbnailPhotos(projectId, lotNumber);
  });

  registerIpcHandler("neud:offline:importLotPhotos", async (event, payload: unknown) => {
    if (
      !payload ||
      typeof payload !== "object" ||
      typeof (payload as { projectId?: unknown }).projectId !== "string" ||
      typeof (payload as { lotNumber?: unknown }).lotNumber !== "string"
    ) {
      throw new Error("Project id and lot number are required.");
    }
    const { projectId, lotNumber } = payload as { projectId: string; lotNumber: string };
    const window = getSenderWindow(event);
    const openResult = window
      ? await dialog.showOpenDialog(window, {
          title: "Add Lot Photos",
          properties: ["openFile", "multiSelections"],
          filters: [
            { name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] },
          ],
        })
      : await dialog.showOpenDialog({
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

  registerIpcHandler("neud:offline:getLotDatasetDetails", (_event, payload: unknown) => {
    if (
      !payload ||
      typeof payload !== "object" ||
      typeof (payload as { projectId?: unknown }).projectId !== "string" ||
      typeof (payload as { lotNumber?: unknown }).lotNumber !== "string"
    ) {
      return null;
    }
    const { projectId, lotNumber } = payload as { projectId: string; lotNumber: string };
    return deps.data.getLotDatasetDetails(projectId, lotNumber);
  });

  registerIpcHandler("neud:offline:listDownloads", (_event, projectId: unknown) => {
    if (typeof projectId !== "string" || !projectId.trim()) {
      return [];
    }
    return deps.data.listAuctionDownloads(projectId);
  });

  registerIpcHandler("neud:offline:refreshDownloads", (_event, projectId: unknown) => {
    if (typeof projectId !== "string" || !projectId.trim()) {
      return null;
    }
    return deps.data.refreshAuctionDataset(projectId);
  });

  registerIpcHandler("neud:offline:clearDownloads", async (_event, projectId: unknown) => {
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

  registerIpcHandler("neud:offline:openDownloadRoot", async (_event, projectId: unknown) => {
    if (typeof projectId !== "string" || !projectId.trim()) {
      return { ok: false, error: "Project id is required." };
    }

    try {
      const project = deps.data.getProjectById(projectId);
      if (!project) {
        return { ok: false, error: "Project not found." };
      }

      const downloadRoot = getProjectAuctionDataDirectory(project.slug);
      const openResult = await shell.openPath(downloadRoot);
      if (openResult) {
        return { ok: false, error: "Unable to open the download folder." };
      }
      return { ok: true, path: downloadRoot };
    } catch {
      return { ok: false, error: "Unable to open the download folder." };
    }
  });

  registerIpcHandler("neud:offline:openDownloadFolder", async (_event, projectId: unknown) => {
    if (typeof projectId !== "string" || !projectId.trim()) {
      throw new Error("Project id is required.");
    }
    const project = deps.data.getProjectById(projectId);
    const selected = deps.data.resolveAuctionDownloadFolder(projectId);
    const target = selected ?? (project ? getProjectAuctionDataDirectory(project.slug) : getAuctionDataDirectory());
    await shell.openPath(target);
    return { ok: true, path: target };
  });

  registerIpcHandler("neud:offline:cancelExport", (_event, operationId: unknown) => {
    if (typeof operationId !== "string" || !operationId.trim()) {
      return { ok: false, error: "Operation id is required." };
    }
    return deps.offlineAuction.cancelCurrentWebpageDownload(operationId);
  });

  registerIpcHandler(
    "neud:offline:export",
    async (event, projectId: unknown) => {
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

  registerIpcHandler("neud:offline:load", async (event, projectId: unknown) => {
    if (typeof projectId !== "string" || !projectId.trim()) {
      throw new Error("Project id is required.");
    }

    const project = deps.data.getProjectById(projectId);
    if (!project) {
      return { ok: false, error: "Project not found." };
    }

    const window = getSenderWindow(event);
    const defaultPath = getProjectAuctionDataDirectory(project.slug);
    const openDialogOptions = {
      title: "Load Broad Arrow Download",
      defaultPath,
      properties: ["openDirectory"] as ("openDirectory")[],
    };
    const openResult = window
      ? await dialog.showOpenDialog(window, openDialogOptions)
      : await dialog.showOpenDialog(openDialogOptions);

    if (openResult.canceled || openResult.filePaths.length === 0) {
      return { ok: false, cancelled: true };
    }

    const selectedDir = openResult.filePaths[0]!;
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

      const resolvedJsonPath = resolveAuctionJsonPathInPackage(selectedDir);
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
          message: `Loaded auction package: ${path.basename(selectedDir)}`,
          metadata: {
            lotCount: loaded.lotCount,
            filePath: resolvedJsonPath,
            packageRoot: selectedDir,
          },
        });
        deps.data.recordLog(engineId, {
          level: "info",
          eventType: "offline.dataset.active",
          message: `Active auction dataset set to ${datasetReference.filename ?? path.basename(resolvedJsonPath)}`,
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
    } catch {
      return {
        ok: false,
        error: "The selected folder does not contain a valid Broad Arrow download.",
      };
    }
  });
}
