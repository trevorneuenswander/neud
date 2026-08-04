import { formatDisplayCurrencyRowsForPylon } from "./display-currency";
import {
  hasCanonicalBid,
  normalizeDisplayBid,
} from "./display-bid-normalization";

export type PylonAuctionDisplay = {
  lot: string;
  title: string;
  year: string;
  reserveStatus: string;
  biddingPrice: string;
  currencies: string[];
  photos: string[];
};

export type PylonFeedPayload = {
  auctionDisplay: PylonAuctionDisplay;
  source?: string;
};

export type PylonLiveStateInput = {
  auctionDisplay?: Record<string, unknown> | null;
  currentLot?: {
    lotNumber?: string;
    title?: string;
    year?: string;
    reserveStatus?: string;
    currentBidLabel?: string;
    currentBid?: number;
    imageUrl?: string;
    photos?: string[];
  } | null;
};

const EMPTY_AUCTION_DISPLAY: PylonAuctionDisplay = {
  lot: "Lot —",
  title: "",
  year: "",
  reserveStatus: "",
  biddingPrice: "",
  currencies: [],
  photos: [],
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function stripCredentials(value: string): string {
  return value.replace(/\/\/[^/@]+@[^/]+\//g, "//");
}

export function mapSnapshotToPylonFeed(
  snapshot: Record<string, unknown> | null | undefined,
): PylonFeedPayload {
  const raw =
    snapshot &&
    typeof snapshot.auctionDisplay === "object" &&
    snapshot.auctionDisplay !== null
      ? (snapshot.auctionDisplay as Record<string, unknown>)
      : null;

  if (!raw) {
    return { auctionDisplay: { ...EMPTY_AUCTION_DISPLAY } };
  }

  const photos = asStringArray(raw.photos).map(stripCredentials);

  const rawBid =
    raw.biddingPrice ??
    raw.currentBidLabel ??
    raw.currentBid;
  const biddingPrice = normalizeDisplayBid(rawBid);
  const currencies = hasCanonicalBid(rawBid)
    ? formatDisplayCurrencyRowsForPylon(asStringArray(raw.currencies))
    : [];

  return {
    auctionDisplay: {
      lot: asString(raw.lot, "Lot —"),
      title: asString(raw.title),
      year: asString(raw.year),
      reserveStatus: asString(raw.reserveStatus),
      biddingPrice,
      currencies,
      photos,
    },
  };
}

export function mapLiveStateToPylonFeed(
  state: PylonLiveStateInput | null | undefined,
): PylonFeedPayload {
  if (!state) {
    return { auctionDisplay: { ...EMPTY_AUCTION_DISPLAY } };
  }

  if (state.auctionDisplay && typeof state.auctionDisplay === "object") {
    return mapSnapshotToPylonFeed({ auctionDisplay: state.auctionDisplay });
  }

  const lot = state.currentLot;
  if (!lot) {
    return { auctionDisplay: { ...EMPTY_AUCTION_DISPLAY } };
  }

  const lotLabel = lot.lotNumber?.trim()
    ? lot.lotNumber.trim().startsWith("Lot")
      ? lot.lotNumber.trim()
      : `Lot ${lot.lotNumber.trim()}`
    : "Lot —";

  const photos = asStringArray(lot.photos).map(stripCredentials);
  const resolvedPhotos =
    photos.length > 0
      ? photos
      : lot.imageUrl
        ? [stripCredentials(lot.imageUrl)]
        : [];

  return mapSnapshotToPylonFeed({
    auctionDisplay: {
      lot: lotLabel,
      title: lot.title ?? "",
      year: lot.year ?? "",
      reserveStatus: lot.reserveStatus ?? "",
      biddingPrice: normalizeDisplayBid(
        lot.currentBidLabel ?? lot.currentBid ?? "",
      ),
      currencies: hasCanonicalBid(lot.currentBidLabel ?? lot.currentBid)
        ? formatDisplayCurrencyRowsForPylon(
            asStringArray((lot as { currencies?: unknown }).currencies),
          )
        : [],
      photos: resolvedPhotos,
    },
  });
}

export function sanitizePylonFeedPayload(
  payload: PylonFeedPayload,
): PylonFeedPayload {
  const serialized = JSON.stringify(payload);
  if (
    /"password"\s*:/i.test(serialized) ||
    /"email"\s*:\s*"[^"]+@[^"]+"/i.test(serialized)
  ) {
    return { auctionDisplay: { ...EMPTY_AUCTION_DISPLAY } };
  }

  return payload;
}
