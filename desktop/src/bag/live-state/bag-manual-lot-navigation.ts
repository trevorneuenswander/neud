import {
  formatReserveStatusLabel,
  readReserveStatusFromRecord,
} from "../reserve-status";
import { compareLotNumbers } from "../lot-number-sort";
import type { BagLiveLot } from "./bag-live-state-types";
import type { LocalControllerDraft } from "./bag-local-controller-state";
import { findLotByIdentifier, findLotIndex, lotIdentity } from "./bag-lot-navigation";

export type ManualLotNavigationState = {
  cursorLotId: string | null;
};

export type ManualLotNavigationCapabilities = {
  cursorLotId: string | null;
  canSelectPrevious: boolean;
  canSelectNext: boolean;
};

export function createEmptyManualLotNavigation(): ManualLotNavigationState {
  return { cursorLotId: null };
}

export function deriveCursorLotIdFromDraft(
  draft: LocalControllerDraft,
  lots: BagLiveLot[],
): string | null {
  if (!draft.lotNumber.trim()) return null;
  const lot = findLotByIdentifier(lots, draft.lotNumber);
  return lot ? lotIdentity(lot) : null;
}

export function findLotByNavigationIdentity(
  lots: BagLiveLot[],
  identity: string,
): BagLiveLot | null {
  return lots.find((lot) => lotIdentity(lot) === identity) ?? null;
}

export function resolveNavigationStartingLot(input: {
  draft: LocalControllerDraft;
  navigation: ManualLotNavigationState;
  submittedLot: BagLiveLot | null;
  datasetCurrentLot: BagLiveLot | null;
  lots: BagLiveLot[];
}): BagLiveLot | null {
  const { draft, navigation, submittedLot, datasetCurrentLot, lots } = input;
  if (lots.length === 0) return null;

  if (draft.lotDirty && draft.lotNumber.trim()) {
    const fromDraft = findLotByIdentifier(lots, draft.lotNumber);
    if (fromDraft) return fromDraft;
  }

  if (navigation.cursorLotId) {
    const fromCursor = findLotByNavigationIdentity(lots, navigation.cursorLotId);
    if (fromCursor) return fromCursor;
  }

  if (submittedLot) {
    const submittedIndex = findLotIndex(lots, submittedLot);
    if (submittedIndex >= 0) return lots[submittedIndex] ?? null;
  }

  if (datasetCurrentLot) {
    const datasetIndex = findLotIndex(lots, datasetCurrentLot);
    if (datasetIndex >= 0) return lots[datasetIndex] ?? null;
  }

  return lots[0] ?? null;
}

export function buildNavigationCapabilities(
  lots: BagLiveLot[],
  startingLot: BagLiveLot | null,
): ManualLotNavigationCapabilities {
  const index = findLotIndex(lots, startingLot);
  return {
    cursorLotId: startingLot ? lotIdentity(startingLot) : null,
    canSelectPrevious: index > 0,
    canSelectNext: index >= 0 && index < lots.length - 1,
  };
}

export function selectAdjacentLot(
  lots: BagLiveLot[],
  startingLot: BagLiveLot | null,
  direction: "previous" | "next",
): BagLiveLot | null {
  const index = findLotIndex(lots, startingLot);
  if (index < 0) return null;

  const targetIndex = direction === "previous" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= lots.length) return null;
  return lots[targetIndex] ?? null;
}

export function lotsDiffer(left: BagLiveLot | null, right: BagLiveLot | null): boolean {
  if (!left || !right) return Boolean(left) !== Boolean(right);
  return lotIdentity(left) !== lotIdentity(right);
}

export function normalizeDownloadedLots(
  dataset: Record<string, unknown> | null | undefined,
): BagLiveLot[] {
  if (!dataset || !Array.isArray(dataset.lots) || dataset.lots.length === 0) {
    return [];
  }

  const lots: BagLiveLot[] = [];
  const seen = new Set<string>();

  for (const entry of dataset.lots) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const lotNumber =
      typeof raw.lotNumber === "string"
        ? raw.lotNumber
        : typeof raw.lot === "string"
          ? raw.lot
          : "";
    const normalizedLotNumber = lotNumber.replace(/^lot\s+/i, "").trim();
    if (!normalizedLotNumber) continue;

    const id = typeof raw.id === "string" ? raw.id : undefined;
    const identity = id ? `id:${id}` : `lot:${normalizedLotNumber.toLowerCase()}`;
    if (seen.has(identity)) continue;
    seen.add(identity);

    const normalizedReserve = readReserveStatusFromRecord(raw);
    const reserveStatus =
      normalizedReserve !== "unknown"
        ? formatReserveStatusLabel(normalizedReserve)
        : typeof raw.reserveStatus === "string"
          ? raw.reserveStatus
          : undefined;

    lots.push({
      id,
      lotNumber: normalizedLotNumber,
      title: typeof raw.title === "string" ? raw.title : undefined,
      year: typeof raw.year === "string" ? raw.year : undefined,
      reserveStatus,
      imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : undefined,
      currentBid: typeof raw.currentBid === "number" ? raw.currentBid : undefined,
      currentBidLabel:
        typeof raw.currentBidLabel === "string" ? raw.currentBidLabel : undefined,
      currency: typeof raw.currency === "string" ? raw.currency : undefined,
    });
  }

  return lots.sort((left, right) =>
    compareLotNumbers(left.lotNumber ?? "", right.lotNumber ?? ""),
  );
}

export function orderedLotsFromDataset(
  automaticLots: BagLiveLot[],
  dataset: Record<string, unknown> | null | undefined,
  preferDatasetOnly = false,
): BagLiveLot[] {
  const downloadedLots = normalizeDownloadedLots(dataset);
  if (downloadedLots.length > 0 && preferDatasetOnly) {
    return downloadedLots;
  }

  if (!dataset || !Array.isArray(dataset.lots) || dataset.lots.length === 0) {
    return automaticLots;
  }

  const byIdentity = new Map<string, BagLiveLot>();
  for (const lot of automaticLots) {
    const identity = lotIdentity(lot);
    if (identity) byIdentity.set(identity, lot);
  }

  const ordered: BagLiveLot[] = [];
  const seen = new Set<string>();

  for (const entry of dataset.lots) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const lotNumber =
      typeof raw.lotNumber === "string"
        ? raw.lotNumber
        : typeof raw.lot === "string"
          ? raw.lot
          : "";
    const id = typeof raw.id === "string" ? raw.id : undefined;

    let matched: BagLiveLot | null = null;
    if (id) {
      matched = byIdentity.get(`id:${id}`) ?? null;
    }
    if (!matched && lotNumber) {
      matched = findLotByIdentifier(automaticLots, lotNumber);
    }

    const normalizedReserve = readReserveStatusFromRecord(raw);
    const reserveStatus =
      normalizedReserve !== "unknown"
        ? formatReserveStatusLabel(normalizedReserve)
        : matched?.reserveStatus;
    const lot: BagLiveLot = matched
      ? {
          ...matched,
          ...(reserveStatus ? { reserveStatus } : {}),
        }
      : {
          id,
          lotNumber: lotNumber.replace(/^lot\s+/i, "").trim() || lotNumber,
          title: typeof raw.title === "string" ? raw.title : undefined,
          year: typeof raw.year === "string" ? raw.year : undefined,
          ...(reserveStatus ? { reserveStatus } : {}),
          imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : undefined,
        };

    const identity = lotIdentity(lot);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    ordered.push(lot);
  }

  return ordered.length > 0 ? ordered : downloadedLots.length > 0 ? downloadedLots : automaticLots;
}