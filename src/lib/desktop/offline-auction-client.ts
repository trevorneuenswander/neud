"use client";

import { getDesktopAPI } from "@/lib/desktop/client";
import type { AuctionDatasetDisplayInfo } from "@/lib/desktop/auction-dataset-client";
import type { OfflineExportProgress } from "@/lib/desktop/offline-auction-types";
import { startWebpageExport } from "@/lib/desktop/webpage-export-client";

export async function hasValidOfflineScrape(projectId: string): Promise<boolean> {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api) return false;
  return api.hasValidScrape(projectId);
}

export async function isOfflineExportInProgress(projectId?: string): Promise<boolean> {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api) return false;
  return api.isExportInProgress(projectId);
}

export async function exportOfflineAuction(projectId: string) {
  return startWebpageExport(projectId);
}

export async function listOfflineDownloads(projectId: string) {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api?.listDownloads) return [];
  return api.listDownloads(projectId);
}

export async function loadOfflineAuction(projectId: string) {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api) {
    throw new Error("Offline auction loading is unavailable.");
  }
  return api.load(projectId);
}

export async function refreshOfflineDownloads(
  projectId: string,
): Promise<AuctionDatasetDisplayInfo | null> {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api?.refreshDownloads) return null;
  return api.refreshDownloads(projectId);
}

export async function clearOfflineDownloads(projectId: string) {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api?.clearDownloads) {
    throw new Error("Clear downloads is unavailable.");
  }
  return api.clearDownloads(projectId);
}

export async function openOfflineDownloadRoot(projectId: string) {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api?.openDownloadRoot) {
    throw new Error("Open download folder is unavailable.");
  }
  return api.openDownloadRoot(projectId);
}

export async function openOfflineDownloadFolder(projectId: string) {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api?.openDownloadFolder) {
    throw new Error("Open download folder is unavailable.");
  }
  return api.openDownloadFolder(projectId);
}

export function subscribeToOfflineExportProgress(
  onProgress: (progress: OfflineExportProgress) => void,
): () => void {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api) {
    return () => {};
  }
  return api.onProgress(onProgress);
}
