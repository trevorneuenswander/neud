import type { BagLiveLot, BagLiveState } from "./bag-live-state-types";
import { formatBidLabel } from "./bag-manual-validation";

export type LocalControllerDraft = {
  lotNumber: string;
  title: string;
  reserveStatus: string;
  currentBid: number | null;
  currentBidLabel: string;
  lotDirty: boolean;
  bidDirty: boolean;
};

export type LocalControllerContext = {
  latestScrapedCurrentLot: BagLiveLot | null;
  localControllerDraft: LocalControllerDraft | null;
  localControllerSubmitted: BagLiveState | null;
};

export function createEmptyDraft(): LocalControllerDraft {
  return {
    lotNumber: "",
    title: "",
    reserveStatus: "",
    currentBid: null,
    currentBidLabel: "",
    lotDirty: false,
    bidDirty: false,
  };
}

export function createDraftFromLot(lot: BagLiveLot | null | undefined): LocalControllerDraft {
  return {
    lotNumber: lot?.lotNumber ?? "",
    title: lot?.title ?? "",
    reserveStatus: lot?.reserveStatus ?? "",
    currentBid: null,
    currentBidLabel: "",
    lotDirty: false,
    bidDirty: false,
  };
}

export function syncDraftFromScrapedLot(
  draft: LocalControllerDraft,
  _lot: BagLiveLot | null | undefined,
): LocalControllerDraft {
  return draft;
}

export function draftLotPatch(
  draft: LocalControllerDraft,
  patch: { lotNumber?: string; title?: string; reserveStatus?: string },
): LocalControllerDraft {
  return {
    ...draft,
    lotNumber: patch.lotNumber ?? draft.lotNumber,
    title: patch.title ?? draft.title,
    reserveStatus: patch.reserveStatus ?? draft.reserveStatus,
    lotDirty: true,
  };
}

export function draftBidAmount(
  draft: LocalControllerDraft,
  amount: number,
  currency = "USD",
): LocalControllerDraft {
  return {
    ...draft,
    currentBid: amount,
    currentBidLabel: formatBidLabel(amount, currency),
    bidDirty: true,
  };
}
