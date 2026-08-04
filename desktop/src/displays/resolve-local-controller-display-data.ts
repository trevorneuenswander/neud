import {
  applyLotPhotoOverrides,
  applyLotPhotoOverridesToCanonicalPhotos,
  type LotPhotoOverrides,
} from "../bag/live-state/lot-photo-overrides";
import {
  getVisibleReserveLabel,
  normalizeReserveStatus,
  readReserveStatusFromRecord,
  resolveMergedReserveStatusLabelOrUnknown,
  resolveStoredReserveStatusLabel,
} from "../bag/reserve-status";
import { filterUsablePhotoUrls, isUsablePhotoUrl } from "./display-utils";
import {
  normalizeCanonicalPhotoInput,
  resolvePhotoUrlsForLocalDisplay,
  type CanonicalPhotoInput,
} from "./canonical-photo";
import {
  hasCanonicalBid,
  normalizeDisplayBid,
  resolveCanonicalBidAmount,
} from "./display-bid-normalization";
import type { EffectiveDisplayLiveState } from "./resolve-effective-display-data";

export const LOCAL_CONTROLLER_WAITING_STATUS = "waiting-for-manual-input";

export type OfflinePhotoReference = {
  relativePath?: string;
  displayUrl?: string;
  sourceUrl?: string;
};

type SubmittedLot = {
  lotNumber?: string;
  title?: string;
  year?: string;
  reserveStatus?: string;
  currentBid?: number;
  currentBidLabel?: string;
  imageUrl?: string;
  photos?: Array<string | OfflinePhotoReference>;
  photoUrls?: string[];
};

type SubmittedState = {
  currentLot?: SubmittedLot | null;
  nextLots?: Array<{
    lotNumber?: string;
    title?: string;
    description?: string;
  }>;
  auctionDisplay?: Record<string, unknown> | null;
};

type DatasetLot = {
  lot?: string;
  lotNumber?: string;
  title?: string;
  year?: string;
  reserveStatus?: string;
  biddingPrice?: string;
  currentBidLabel?: string;
  currentBid?: number;
  photos?: Array<string | OfflinePhotoReference>;
  photoUrls?: string[];
  imageUrl?: string;
};

function normalizeLotNumber(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/^lot\s+/i, "").trim();
}

function readDatasetLots(dataset: Record<string, unknown> | null | undefined): DatasetLot[] {
  if (!dataset) return [];
  if (Array.isArray(dataset.lots)) {
    return dataset.lots.filter(
      (entry): entry is DatasetLot => Boolean(entry) && typeof entry === "object",
    );
  }
  return [];
}

function findDatasetLot(
  dataset: Record<string, unknown> | null | undefined,
  lotNumber: string,
): DatasetLot | null {
  const normalized = normalizeLotNumber(lotNumber);
  if (!normalized) return null;

  for (const lot of readDatasetLots(dataset)) {
    const candidate = normalizeLotNumber(lot.lotNumber ?? lot.lot);
    if (candidate && candidate === normalized) {
      return lot;
    }
  }
  return null;
}

function readPhotoUrl(value: string | OfflinePhotoReference): string | null {
  if (typeof value === "string") return value;
  if (value.displayUrl) return value.displayUrl;
  if (value.sourceUrl) return value.sourceUrl;
  return null;
}

function mergeCanonicalPhotoInputs(
  lot: SubmittedLot,
  datasetLot: DatasetLot | null,
): CanonicalPhotoInput[] {
  const ordered: CanonicalPhotoInput[] = [];
  const seen = new Set<string>();

  const add = (value: string | OfflinePhotoReference | null | undefined) => {
    if (!value) return;
    if (typeof value === "string") {
      const normalized = normalizeCanonicalPhotoInput(value);
      if (!normalized) return;
      const key =
        typeof normalized === "string"
          ? normalized
          : [
              normalized.localUrl ?? "",
              normalized.remoteUrl ?? "",
              normalized.originalUrl ?? "",
            ].join("|");
      if (seen.has(key)) return;
      seen.add(key);
      ordered.push(normalized);
      return;
    }

    const localUrl = value.displayUrl?.trim() || undefined;
    const remoteUrl = value.sourceUrl?.trim() || undefined;
    const normalized = normalizeCanonicalPhotoInput({
      localUrl,
      remoteUrl,
      originalUrl: remoteUrl,
    });
    if (!normalized) return;
    const key =
      typeof normalized === "string"
        ? normalized
        : [
            normalized.localUrl ?? "",
            normalized.remoteUrl ?? "",
            normalized.originalUrl ?? "",
          ].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(normalized);
  };

  if (Array.isArray(lot.photos)) {
    for (const photo of lot.photos) add(photo);
  }
  add(lot.imageUrl);

  if (datasetLot) {
    if (Array.isArray(datasetLot.photos)) {
      for (const photo of datasetLot.photos) add(photo);
    }
    if (Array.isArray(datasetLot.photoUrls)) {
      for (const photo of datasetLot.photoUrls) add(photo);
    }
    add(datasetLot.imageUrl);
  }

  return ordered;
}

function mergePhotoUrls(
  lot: SubmittedLot,
  datasetLot: DatasetLot | null,
): string[] {
  return resolvePhotoUrlsForLocalDisplay(mergeCanonicalPhotoInputs(lot, datasetLot));
}

function readCurrencyStrings(submitted: SubmittedState | null | undefined): string[] {
  const fromDisplay = submitted?.auctionDisplay?.currencies;
  if (Array.isArray(fromDisplay)) {
    return fromDisplay.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

function hasSubmittedLotContent(lot: SubmittedLot | null | undefined): boolean {
  if (!lot) return false;
  return Boolean(
    lot.lotNumber?.trim() ||
      lot.title?.trim() ||
      lot.currentBidLabel?.trim() ||
      (lot.currentBid != null && lot.currentBid > 0),
  );
}

export function resolveLocalControllerDisplayData(input: {
  submitted: SubmittedState | null | undefined;
  dataset?: Record<string, unknown> | null;
  photoOverrides?: LotPhotoOverrides | null;
  enrichCanonicalPhotos?: (photos: CanonicalPhotoInput[]) => CanonicalPhotoInput[];
}): EffectiveDisplayLiveState | null {
  const submittedLot = input.submitted?.currentLot ?? null;
  if (!hasSubmittedLotContent(submittedLot)) {
    return null;
  }

  const datasetLot = findDatasetLot(input.dataset ?? null, submittedLot?.lotNumber ?? "");
  const mergedCanonicalPhotos = mergeCanonicalPhotoInputs(submittedLot ?? {}, datasetLot);
  const overriddenCanonicalPhotos = applyLotPhotoOverridesToCanonicalPhotos(
    mergedCanonicalPhotos,
    input.photoOverrides,
    submittedLot?.lotNumber ?? "",
  );
  const canonicalPhotos = input.enrichCanonicalPhotos
    ? input.enrichCanonicalPhotos(overriddenCanonicalPhotos)
    : overriddenCanonicalPhotos;
  const mergedPhotos = resolvePhotoUrlsForLocalDisplay(canonicalPhotos);
  const photos = applyLotPhotoOverrides(
    mergedPhotos.map((url) => ({ url })),
    input.photoOverrides,
    submittedLot?.lotNumber ?? "",
  ).map((entry) => entry.url);
  const canonicalBidAmount = resolveCanonicalBidAmount({
    currentBid: submittedLot?.currentBid,
    currentBidLabel: submittedLot?.currentBidLabel,
    biddingPrice:
      typeof input.submitted?.auctionDisplay?.biddingPrice === "string"
        ? input.submitted.auctionDisplay.biddingPrice
        : undefined,
  });
  const biddingPrice = normalizeDisplayBid(
    submittedLot?.currentBidLabel ??
      submittedLot?.currentBid ??
      input.submitted?.auctionDisplay?.biddingPrice ??
      "",
  );
  const currencies = hasCanonicalBid(canonicalBidAmount)
    ? readCurrencyStrings(input.submitted)
    : [];

  const lotReserveStatus = resolveStoredReserveStatusLabel(
    submittedLot?.reserveStatus,
    datasetLot as Record<string, unknown> | null,
  );
  const displayReserveStatus =
    getVisibleReserveLabel(
      normalizeReserveStatus(submittedLot?.reserveStatus) !== "unknown"
        ? normalizeReserveStatus(submittedLot?.reserveStatus)
        : readReserveStatusFromRecord(datasetLot as Record<string, unknown> | null),
    ) ?? "";

  const currentLot = {
    lotNumber: submittedLot?.lotNumber ?? "",
    title: submittedLot?.title ?? "",
    year: submittedLot?.year ?? datasetLot?.year ?? "",
    reserveStatus: lotReserveStatus,
    currentBid: canonicalBidAmount ?? undefined,
    currentBidLabel: biddingPrice === "—" ? "" : biddingPrice,
    imageUrl: photos[0] ?? submittedLot?.imageUrl,
    photos,
  };

  return {
    currentLot,
    nextLots: input.submitted?.nextLots ?? [],
    auctionDisplay: {
      lot: currentLot.lotNumber
        ? currentLot.lotNumber.trim().startsWith("Lot")
          ? currentLot.lotNumber.trim()
          : `Lot ${currentLot.lotNumber.trim()}`
        : "Lot —",
      title: currentLot.title ?? "",
      year: currentLot.year ?? "",
      reserveStatus: displayReserveStatus,
      biddingPrice,
      currencies,
      photos: canonicalPhotos,
    },
  };
}
