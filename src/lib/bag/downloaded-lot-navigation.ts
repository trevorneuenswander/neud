import {
  formatReserveStatusLabel,
  normalizeReserveStatus,
  readReserveStatusFromRecord,
  type ReserveStatus,
} from "@/lib/bag/reserve-status";

export type ManualLotViewSource = "downloaded-dataset" | "manual-entry" | "live-snapshot";

export type DownloadedAuctionLot = {
  stableId: string;
  lotNumber: string;
  title: string;
  reserveStatus: ReserveStatus;
  reserveStatusLabel: string;
  bid: string;
  bidAmount: number | null;
  vehicleId?: string;
  sourceLotId?: string;
  photos: Array<string | Record<string, unknown>>;
  raw: Record<string, unknown>;
};

export type ManualControllerDraft = {
  lotNumber: string;
  title: string;
  reserveStatus: ReserveStatus;
  bid: string;
  bidAmount: number | null;
  vehicleId?: string;
  sourceLotId?: string;
  stableId: string;
};

function compareLotNumbers(left: string, right: string): number {
  const leftMatch = left.trim().match(/^(\d+(?:\.\d+)?)([A-Za-z]?)$/);
  const rightMatch = right.trim().match(/^(\d+(?:\.\d+)?)([A-Za-z]?)$/);
  if (leftMatch && rightMatch) {
    const leftNum = Number.parseFloat(leftMatch[1] ?? "0");
    const rightNum = Number.parseFloat(rightMatch[1] ?? "0");
    if (leftNum !== rightNum) {
      return leftNum - rightNum;
    }
    return (leftMatch[2] ?? "").localeCompare(rightMatch[2] ?? "");
  }
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export function downloadedLotStableId(raw: Record<string, unknown>, lotNumber: string): string {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (id) return `id:${id}`;
  const vehicleId =
    typeof raw.vehicleId === "string"
      ? raw.vehicleId.trim()
      : typeof raw.vehicle_id === "string"
        ? raw.vehicle_id.trim()
        : "";
  if (vehicleId) return `vehicle:${vehicleId}`;
  const normalized = lotNumber.replace(/^lot\s+/i, "").trim().toLowerCase();
  return normalized ? `lot:${normalized}` : "";
}

export function resolveDownloadedLotReserveStatus(raw: Record<string, unknown>): {
  status: ReserveStatus;
  label: string;
} {
  if (typeof raw.reserveStatus === "string" && raw.reserveStatus.trim()) {
    const status = normalizeReserveStatus(raw.reserveStatus);
    if (status !== "unknown") {
      return { status, label: formatReserveStatusLabel(status) };
    }
    return { status: "unknown", label: raw.reserveStatus.trim() };
  }

  if (raw.noReserve === true || raw.no_reserve === true) {
    return { status: "offered_without_reserve", label: "No Reserve" };
  }

  if (raw.reservesOff === true || raw.reserves_off === true) {
    return { status: "offered_without_reserve", label: "Reserve Off" };
  }

  if (raw.sold === true) {
    return { status: "unknown", label: "Sold" };
  }

  const reservePrice =
    typeof raw.reservePrice === "number"
      ? raw.reservePrice
      : typeof raw.reserve_price === "number"
        ? raw.reserve_price
        : null;
  if (reservePrice != null && Number.isFinite(reservePrice)) {
    return {
      status: "has_reserve",
      label: `$${reservePrice.toLocaleString("en-US")}`,
    };
  }

  const canonical = readReserveStatusFromRecord(raw);
  if (canonical !== "unknown") {
    return { status: canonical, label: formatReserveStatusLabel(canonical) };
  }

  return { status: "unknown", label: "" };
}

function readLotPhotos(raw: Record<string, unknown>): Array<string | Record<string, unknown>> {
  if (Array.isArray(raw.photos) && raw.photos.length > 0) {
    return raw.photos as Array<string | Record<string, unknown>>;
  }
  if (Array.isArray(raw.photoUrls) && raw.photoUrls.length > 0) {
    return raw.photoUrls as string[];
  }
  if (Array.isArray(raw.images) && raw.images.length > 0) {
    return raw.images as Array<string | Record<string, unknown>>;
  }
  return [];
}

function readBidFields(raw: Record<string, unknown>): { bid: string; bidAmount: number | null } {
  const currentBid =
    typeof raw.currentBid === "number"
      ? raw.currentBid
      : typeof raw.current_bid === "number"
        ? raw.current_bid
        : null;
  const currentBidLabel =
    typeof raw.currentBidLabel === "string"
      ? raw.currentBidLabel.trim()
      : typeof raw.current_bid_label === "string"
        ? raw.current_bid_label.trim()
        : "";

  if (currentBidLabel) {
    return { bid: currentBidLabel, bidAmount: currentBid };
  }
  if (currentBid != null && Number.isFinite(currentBid)) {
    return { bid: `$${currentBid.toLocaleString("en-US")}`, bidAmount: currentBid };
  }
  return { bid: "", bidAmount: null };
}

export function normalizeDownloadedLots(
  dataset: Record<string, unknown> | null | undefined,
): DownloadedAuctionLot[] {
  if (!dataset || !Array.isArray(dataset.lots) || dataset.lots.length === 0) {
    return [];
  }

  const lots: DownloadedAuctionLot[] = [];
  const seen = new Set<string>();

  for (const entry of dataset.lots) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const lotNumberRaw =
      typeof raw.lotNumber === "string"
        ? raw.lotNumber
        : typeof raw.lot === "string"
          ? raw.lot
          : "";
    const lotNumber = lotNumberRaw.replace(/^lot\s+/i, "").trim();
    if (!lotNumber) continue;

    const stableId = downloadedLotStableId(raw, lotNumber);
    if (!stableId || seen.has(stableId)) continue;
    seen.add(stableId);

    const reserve = resolveDownloadedLotReserveStatus(raw);
    const bid = readBidFields(raw);
    const vehicleId =
      typeof raw.vehicleId === "string"
        ? raw.vehicleId
        : typeof raw.vehicle_id === "string"
          ? raw.vehicle_id
          : undefined;
    const sourceLotId = typeof raw.id === "string" ? raw.id : undefined;

    lots.push({
      stableId,
      lotNumber,
      title: typeof raw.title === "string" ? raw.title : "",
      reserveStatus: reserve.status,
      reserveStatusLabel: reserve.label,
      bid: bid.bid,
      bidAmount: bid.bidAmount,
      vehicleId,
      sourceLotId,
      photos: readLotPhotos(raw),
      raw,
    });
  }

  return lots.sort((left, right) => compareLotNumbers(left.lotNumber, right.lotNumber));
}

export function orderedLotsFromDataset(
  dataset: Record<string, unknown> | null | undefined,
  options?: { preferDatasetOnly?: boolean },
): DownloadedAuctionLot[] {
  void options;
  return normalizeDownloadedLots(dataset);
}

export function buildManualDraftFromDownloadedLot(
  lot: DownloadedAuctionLot,
): ManualControllerDraft {
  return {
    stableId: lot.stableId,
    lotNumber: lot.lotNumber,
    title: lot.title,
    reserveStatus: lot.reserveStatus,
    bid: lot.bid,
    bidAmount: lot.bidAmount,
    vehicleId: lot.vehicleId,
    sourceLotId: lot.sourceLotId,
  };
}

export function isDownloadedDatasetSource(source: string | undefined): boolean {
  return source === "downloaded" || source === "loaded";
}
