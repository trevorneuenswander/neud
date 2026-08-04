import type { DownloadedAuctionLot } from "@/lib/bag/downloaded-lot-navigation";
import type { ReserveStatus } from "@/lib/bag/reserve-status";

export type LotEditingSource =
  | "downloaded-selection"
  | "typed-match"
  | "manual-entry"
  | "previous"
  | "next";

export type LotEditingDraft = {
  lotNumber: string;
  title: string;
  reserveStatus: ReserveStatus;
  bid: string;
};

export function normalizeLotNumberForMatch(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^lot\s+/i, "")
    .toUpperCase();
}

export function findMatchingDownloadedLot(
  loadedLots: DownloadedAuctionLot[],
  lotNumber: string,
): DownloadedAuctionLot | null {
  const normalized = normalizeLotNumberForMatch(lotNumber);
  if (!normalized) return null;
  return (
    loadedLots.find(
      (lot) => normalizeLotNumberForMatch(lot.lotNumber) === normalized,
    ) ?? null
  );
}

export function isPartialDownloadedLotEntry(
  normalizedInput: string,
  loadedLots: DownloadedAuctionLot[],
): boolean {
  if (!normalizedInput) {
    return false;
  }

  return loadedLots.some((lot) => {
    const candidate = normalizeLotNumberForMatch(lot.lotNumber);
    if (!candidate) {
      return false;
    }
    return candidate.startsWith(normalizedInput) || normalizedInput.startsWith(candidate);
  });
}

export function findDownloadedLotIndex(
  loadedLots: DownloadedAuctionLot[],
  stableId: string,
): number {
  return loadedLots.findIndex((lot) => lot.stableId === stableId);
}

export function buildSelectedLotPersistenceKey(lot: DownloadedAuctionLot): string {
  const stableId = lot.stableId.trim();
  if (stableId) {
    return stableId;
  }
  return `lot:${normalizeLotNumberForMatch(lot.lotNumber).toLowerCase()}`;
}

export function findDownloadedLotIndexByPersistenceKey(
  loadedLots: DownloadedAuctionLot[],
  selectedLotKey: string,
): number {
  const key = selectedLotKey.trim();
  if (!key) {
    return -1;
  }

  const byStableId = findDownloadedLotIndex(loadedLots, key);
  if (byStableId >= 0) {
    return byStableId;
  }

  if (key.startsWith("lot:")) {
    const normalized = key.slice(4).toUpperCase();
    return loadedLots.findIndex(
      (lot) => normalizeLotNumberForMatch(lot.lotNumber) === normalized,
    );
  }

  const normalizedKey = normalizeLotNumberForMatch(key);
  if (normalizedKey) {
    return loadedLots.findIndex(
      (lot) => normalizeLotNumberForMatch(lot.lotNumber) === normalizedKey,
    );
  }

  return -1;
}

export type DownloadedLotMatchResolution =
  | { action: "skip"; normalizedLot: string }
  | { action: "clear"; normalizedLot: string }
  | { action: "match"; normalizedLot: string; lot: DownloadedAuctionLot };

export function resolveDownloadedLotMatch(input: {
  lotInput: string;
  loadedLots: DownloadedAuctionLot[];
  lastProcessedNormalizedLot: string | null;
}): DownloadedLotMatchResolution {
  const normalizedLot = normalizeLotNumberForMatch(input.lotInput);

  if (normalizedLot && normalizedLot === input.lastProcessedNormalizedLot) {
    return { action: "skip", normalizedLot };
  }

  if (!normalizedLot) {
    return { action: "clear", normalizedLot };
  }

  const lot = findMatchingDownloadedLot(input.loadedLots, input.lotInput);
  if (lot) {
    return { action: "match", normalizedLot, lot };
  }

  if (isPartialDownloadedLotEntry(normalizedLot, input.loadedLots)) {
    return { action: "skip", normalizedLot };
  }

  return { action: "clear", normalizedLot };
}
