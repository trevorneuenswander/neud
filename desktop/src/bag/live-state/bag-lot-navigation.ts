import type { BagLiveLot, BagLiveState } from "./bag-live-state-types";

export function lotIdentity(lot: BagLiveLot | null | undefined): string | null {
  if (!lot) return null;
  if (lot.id) return `id:${lot.id}`;
  if (lot.lotNumber) return `lot:${lot.lotNumber.trim().toLowerCase()}`;
  return null;
}

export function findLotIndex(lots: BagLiveLot[], lot: BagLiveLot | null): number {
  const identity = lotIdentity(lot);
  if (!identity) return -1;

  return lots.findIndex((candidate) => lotIdentity(candidate) === identity);
}

export function findLotByIdentifier(
  lots: BagLiveLot[],
  identifier: string,
): BagLiveLot | null {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  const byId = lots.find((lot) => lot.id === trimmed);
  if (byId) return byId;

  const normalized = trimmed.toLowerCase();
  return (
    lots.find((lot) => lot.lotNumber?.trim().toLowerCase() === normalized) ??
    lots.find((lot) => lot.lotNumber?.replace(/^lot\s+/i, "").toLowerCase() === normalized) ??
    null
  );
}

export function rebuildNavigation(state: BagLiveState, currentLot: BagLiveLot | null): BagLiveState {
  const lots = state.lots;
  const index = findLotIndex(lots, currentLot);

  return {
    ...state,
    currentLot,
    previousLot: index > 0 ? lots[index - 1] ?? null : null,
    nextLots: index >= 0 ? lots.slice(index + 1, index + 4) : lots.slice(0, 3),
  };
}

export function selectNextLot(state: BagLiveState): BagLiveLot | null {
  if (state.lots.length === 0) return null;
  const index = findLotIndex(state.lots, state.currentLot);
  if (index < 0) return state.lots[0] ?? null;
  return state.lots[index + 1] ?? null;
}

export function selectPreviousLot(state: BagLiveState): BagLiveLot | null {
  if (state.lots.length === 0) return null;
  const index = findLotIndex(state.lots, state.currentLot);
  if (index <= 0) return null;
  return state.lots[index - 1] ?? null;
}

export function statesDifferForComparison(
  manual: BagLiveState,
  automatic: BagLiveState | null,
): boolean {
  if (!automatic) return false;
  const manualLot = manual.currentLot;
  const autoLot = automatic.currentLot;
  if (!manualLot && !autoLot) return false;
  if (!manualLot || !autoLot) return true;
  return (
    lotIdentity(manualLot) !== lotIdentity(autoLot) ||
    manualLot.currentBid !== autoLot.currentBid ||
    manualLot.sold !== autoLot.sold ||
    manualLot.passed !== autoLot.passed
  );
}
