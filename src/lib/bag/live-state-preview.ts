import type { BagLiveLot, BagLiveState } from "@/lib/bag/types";
import type { BagSnapshotData } from "@/lib/data-engines/types";

function lotToLegacyRow(lot: BagLiveLot | null | undefined): Record<string, unknown> | null {
  if (!lot) return null;

  return {
    lot: lot.lotNumber ?? null,
    title: lot.title ?? null,
    price: lot.currentBidLabel ?? (lot.currentBid != null ? String(lot.currentBid) : ""),
    status: lot.status ?? null,
    editHref: lot.detailUrl ?? null,
  };
}

/** Maps effective BAG live state to the legacy-compatible preview shape. */
export function bagLiveStateToPreviewData(state: BagLiveState | null): BagSnapshotData | null {
  if (!state) return null;

  const hasContent =
    state.currentLot ||
    state.previousLot ||
    state.nextLots.length > 0 ||
    state.lots.length > 0 ||
    state.lastSold ||
    state.auctionDisplay;

  if (!hasContent) {
    return null;
  }

  return {
    prev: lotToLegacyRow(state.previousLot),
    current: lotToLegacyRow(state.currentLot),
    next: state.nextLots
      .map((lot) => lotToLegacyRow(lot))
      .filter((row): row is Record<string, unknown> => row !== null),
    lots: state.lots
      .map((lot) => lotToLegacyRow(lot))
      .filter((row): row is Record<string, unknown> => row !== null),
    lastSold: state.lastSold
      ? {
          lot: state.lastSold.lotNumber ?? null,
          title: state.lastSold.title ?? null,
          price: state.lastSold.currentBidLabel ?? null,
          editUrl: state.lastSold.detailUrl ?? null,
        }
      : null,
    auctionDisplay: state.auctionDisplay ?? null,
    updatedAt: state.updatedAt,
  };
}

function previewTimestamp(data: BagSnapshotData | null | undefined): number {
  if (!data?.updatedAt) {
    return 0;
  }
  const parsed = Date.parse(data.updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Prefer the newest scraper canonical snapshot between live-state and engine snapshot. */
export function pickAuthoritativeScraperPreview(
  liveStatePreview: BagSnapshotData | null,
  engineSnapshotPreview: BagSnapshotData | null,
): BagSnapshotData | null {
  if (!liveStatePreview && !engineSnapshotPreview) {
    return null;
  }
  if (!liveStatePreview) {
    return engineSnapshotPreview;
  }
  if (!engineSnapshotPreview) {
    return liveStatePreview;
  }
  return previewTimestamp(engineSnapshotPreview) >= previewTimestamp(liveStatePreview)
    ? engineSnapshotPreview
    : liveStatePreview;
}

export function pickLegacyPreviewFields(data: BagSnapshotData): BagSnapshotData {
  return {
    prev: data.prev ?? null,
    current: data.current ?? null,
    next: data.next ?? [],
    lots: data.lots ?? [],
    lastSold: data.lastSold ?? null,
    auctionDisplay: data.auctionDisplay ?? null,
    updatedAt: data.updatedAt ?? undefined,
  };
}
