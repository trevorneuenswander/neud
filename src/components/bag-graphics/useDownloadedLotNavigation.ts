"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildManualDraftFromDownloadedLot,
  isDownloadedDatasetSource,
  type DownloadedAuctionLot,
  type ManualLotViewSource,
} from "@/lib/bag/downloaded-lot-navigation";
import { getActiveDownloadedLots } from "@/lib/desktop/auction-dataset-client";

type UseDownloadedLotNavigationInput = {
  projectId: string;
  datasetSource?: string;
  datasetPath?: string;
};

export function useDownloadedLotNavigation({
  projectId,
  datasetSource,
  datasetPath,
}: UseDownloadedLotNavigationInput) {
  const [loadedLots, setLoadedLots] = useState<DownloadedAuctionLot[]>([]);
  const [selectedDownloadedLotIndex, setSelectedDownloadedLotIndex] = useState(-1);
  const loadedDatasetKeyRef = useRef<string | null>(null);

  const manualLotViewSource: ManualLotViewSource = isDownloadedDatasetSource(datasetSource)
    ? "downloaded-dataset"
    : "manual-entry";

  useEffect(() => {
    if (!isDownloadedDatasetSource(datasetSource)) {
      setLoadedLots([]);
      loadedDatasetKeyRef.current = null;
      return;
    }

    const datasetKey = datasetPath ?? datasetSource ?? "downloaded";
    let cancelled = false;

    void getActiveDownloadedLots(projectId)
      .then((lots) => {
        if (cancelled) return;
        setLoadedLots(lots);
        if (loadedDatasetKeyRef.current !== datasetKey) {
          loadedDatasetKeyRef.current = datasetKey;
          setSelectedDownloadedLotIndex(-1);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedLots([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, datasetSource, datasetPath]);

  useEffect(() => {
    setSelectedDownloadedLotIndex((current) => {
      if (current < 0) {
        return current;
      }
      return Math.min(Math.max(current, 0), Math.max(loadedLots.length - 1, 0));
    });
  }, [loadedLots.length]);

  const selectedDownloadedLot =
    selectedDownloadedLotIndex >= 0
      ? (loadedLots[selectedDownloadedLotIndex] ?? null)
      : null;

  const previewLotNumber = selectedDownloadedLot?.lotNumber ?? "";

  const previewPhotos = useMemo(() => {
    if (!selectedDownloadedLot) {
      return [] as string[];
    }
    const photos = selectedDownloadedLot.photos;
    const urls: string[] = [];
    const seen = new Set<string>();
    for (const entry of photos) {
      const url =
        typeof entry === "string"
          ? entry.trim()
          : typeof entry === "object" && entry && typeof entry.url === "string"
            ? entry.url.trim()
            : "";
      if (!url || seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
    return urls;
  }, [selectedDownloadedLot, selectedDownloadedLot?.stableId, selectedDownloadedLotIndex]);

  const handlePreviousLot = useCallback(() => {
    setSelectedDownloadedLotIndex((current) => Math.max(0, current - 1));
  }, []);

  const handleNextLot = useCallback(() => {
    setSelectedDownloadedLotIndex((current) =>
      Math.min(Math.max(loadedLots.length - 1, 0), current + 1),
    );
  }, [loadedLots.length]);

  const isSelectionResolved = selectedDownloadedLotIndex >= 0;

  const canSelectPrevious =
    isSelectionResolved &&
    manualLotViewSource === "downloaded-dataset" &&
    selectedDownloadedLotIndex > 0;
  const canSelectNext =
    isSelectionResolved &&
    manualLotViewSource === "downloaded-dataset" &&
    loadedLots.length > 0 &&
    selectedDownloadedLotIndex < loadedLots.length - 1;

  return {
    manualLotViewSource,
    loadedLots,
    selectedDownloadedLotIndex,
    selectedDownloadedLot,
    isSelectionResolved,
    isSelectionRestoring:
      manualLotViewSource === "downloaded-dataset" &&
      loadedLots.length > 0 &&
      !isSelectionResolved,
    canSelectPrevious,
    canSelectNext,
    handlePreviousLot,
    handleNextLot,
    previewLotNumber,
    previewPhotos,
    setSelectedDownloadedLotIndex,
    clearSelectedDownloadedLot: () => setSelectedDownloadedLotIndex(-1),
    buildBaselineDraft: (lot: DownloadedAuctionLot) => buildManualDraftFromDownloadedLot(lot),
  };
}
