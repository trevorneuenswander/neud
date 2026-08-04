"use client";

import { getDesktopAPI } from "@/lib/desktop/client";
import type { AuctionDatasetDisplayInfo } from "@/lib/desktop/offline-auction-types";

export type { AuctionDatasetDisplayInfo };

export async function getActiveAuctionDataset(
  projectId: string,
): Promise<AuctionDatasetDisplayInfo | null> {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api?.getActiveDataset) return null;
  return api.getActiveDataset(projectId);
}

export async function getActiveDownloadedLots(projectId: string) {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api?.getActiveDownloadedDataset) return [];
  const dataset = await api.getActiveDownloadedDataset(projectId);
  const { orderedLotsFromDataset } = await import("@/lib/bag/downloaded-lot-navigation");
  return orderedLotsFromDataset(dataset, { preferDatasetOnly: true });
}

export async function getLotThumbnailPhotos(
  projectId: string,
  lotNumber: string,
): Promise<Array<{ url: string; alt: string; source: "local" | "remote" }>> {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api?.getLotThumbnailPhotos || !lotNumber.trim()) return [];
  return api.getLotThumbnailPhotos(projectId, lotNumber.trim());
}

export async function getLotDatasetDetails(
  projectId: string,
  lotNumber: string,
): Promise<{ title: string; reserveStatus: string } | null> {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api?.getLotDatasetDetails || !lotNumber.trim()) return null;
  return api.getLotDatasetDetails(projectId, lotNumber.trim());
}
