import {
  BAG_LIVE_STATE_SCHEMA_VERSION,
  type BagConnectionStatus,
  type BagLiveLot,
  type BagLiveState,
  type BagSnapshotPayload,
} from "./bag-live-state-types";
import {
  readReserveStatusFromRecord,
  resolveReserveStatusDisplayLabel,
  serializeReserveStatusForStorage,
} from "../reserve-status";

export type NormalizeBagSnapshotInput = {
  projectId: string;
  engineId: string;
  snapshotId: string;
  capturedAt: string;
  snapshot: BagSnapshotPayload;
  connection: {
    status: BagConnectionStatus;
    lastSuccessfulScrapeAt?: string;
    lastAttemptAt?: string;
    lastError?: string;
  };
  previousState?: BagLiveState | null;
};

export type NormalizeBagSnapshotResult =
  | { ok: true; state: BagLiveState }
  | { ok: false; error: string; preservePrevious: boolean };

export function normalizeBagSnapshot(
  input: NormalizeBagSnapshotInput,
): NormalizeBagSnapshotResult {
  if (!input.snapshot || typeof input.snapshot !== "object") {
    return {
      ok: false,
      error: "Snapshot payload is missing or invalid.",
      preservePrevious: true,
    };
  }

  const lots = normalizeLotList(input.snapshot.lots);
  const currentLot = selectCurrentLot(input.snapshot, lots);
  const previousLot = normalizeLotRow(input.snapshot.prev);
  const nextLots = normalizeLotList(input.snapshot.next);
  const lastSold = normalizeLastSold(input.snapshot.lastSold);

  const hasLotSignal =
    currentLot !== null ||
    lots.length > 0 ||
    Boolean(input.snapshot.auctionDisplay);

  if (!hasLotSignal && input.previousState?.currentLot) {
    return {
      ok: false,
      error: "Snapshot did not include a current lot or auction display.",
      preservePrevious: true,
    };
  }

  const capturedAt =
    input.capturedAt ||
    (typeof input.snapshot.updatedAt === "string"
      ? input.snapshot.updatedAt
      : new Date().toISOString());

  return {
    ok: true,
    state: {
      schemaVersion: BAG_LIVE_STATE_SCHEMA_VERSION,
      projectId: input.projectId,
      engineId: input.engineId,
      mode: "automatic",
      connection: {
        ...input.connection,
        lastSuccessfulScrapeAt: capturedAt,
        lastAttemptAt: capturedAt,
        lastError: undefined,
      },
      currentLot,
      previousLot,
      nextLots,
      lastSold,
      lots,
      lotCount: lots.length,
      auctionDisplay:
        input.snapshot.auctionDisplay && typeof input.snapshot.auctionDisplay === "object"
          ? (input.snapshot.auctionDisplay as Record<string, unknown>)
          : null,
      source: {
        type: "scraper",
        snapshotId: input.snapshotId,
        capturedAt,
      },
      updatedAt: capturedAt,
    },
  };
}

export function createEmptyBagLiveState(input: {
  projectId: string;
  engineId: string;
  connection?: Partial<BagLiveState["connection"]>;
}): BagLiveState {
  const now = new Date().toISOString();
  return {
    schemaVersion: BAG_LIVE_STATE_SCHEMA_VERSION,
    projectId: input.projectId,
    engineId: input.engineId,
    mode: "automatic",
    connection: {
      status: input.connection?.status ?? "stopped",
      lastSuccessfulScrapeAt: input.connection?.lastSuccessfulScrapeAt,
      lastAttemptAt: input.connection?.lastAttemptAt,
      lastError: input.connection?.lastError,
    },
    currentLot: null,
    previousLot: null,
    nextLots: [],
    lastSold: null,
    lots: [],
    lotCount: 0,
    auctionDisplay: null,
    source: {
      type: "scraper",
    },
    updatedAt: now,
  };
}

function selectCurrentLot(
  snapshot: BagSnapshotPayload,
  lots: BagLiveLot[],
): BagLiveLot | null {
  const display = normalizeAuctionDisplay(snapshot.auctionDisplay);
  const current = normalizeLotRow(snapshot.current);

  if (display && current) {
    return mergeLots(current, display);
  }
  if (display) return display;
  if (current) return current;

  const active = lots.find((lot) => /active/i.test(lot.status ?? ""));
  return active ?? null;
}

function mergeLots(primary: BagLiveLot, secondary: BagLiveLot): BagLiveLot {
  return {
    ...secondary,
    ...primary,
    lotNumber: primary.lotNumber ?? secondary.lotNumber,
    title: primary.title ?? secondary.title,
    year: secondary.year ?? primary.year,
    currentBid: secondary.currentBid ?? primary.currentBid,
    currentBidLabel: secondary.currentBidLabel ?? primary.currentBidLabel,
    imageUrl: secondary.imageUrl ?? primary.imageUrl,
    reserveStatus: secondary.reserveStatus ?? primary.reserveStatus,
    detailUrl: primary.detailUrl ?? secondary.detailUrl,
    status: primary.status ?? secondary.status,
    sold: primary.sold ?? secondary.sold,
    passed: primary.passed ?? secondary.passed,
  };
}

function normalizeAuctionDisplay(
  value: Record<string, unknown> | null | undefined,
): BagLiveLot | null {
  if (!value || typeof value !== "object") return null;

  const lotNumber = cleanLotNumber(value.lot);
  const titleParts = [
    typeof value.year === "string" ? value.year.trim() : "",
    typeof value.title === "string" ? value.title.trim() : "",
  ].filter(Boolean);

  const bid = parseBid(value.biddingPrice);
  const photos = Array.isArray(value.photos) ? value.photos : [];
  const imageUrl =
    typeof photos[0] === "string" && photos[0].startsWith("https://")
      ? photos[0]
      : undefined;

  if (!lotNumber && titleParts.length === 0 && !bid.label) {
    return null;
  }

  return {
    lotNumber,
    title: titleParts.join(" ").trim() || undefined,
    year: typeof value.year === "string" ? value.year.trim() : undefined,
    currentBid: bid.amount,
    currentBidLabel: bid.label,
    currency: bid.currency,
    reserveStatus: resolveReserveStatusLabelFromRow(value),
    imageUrl,
  };
}

function resolveReserveStatusLabelFromRow(
  value: Record<string, unknown>,
): string | undefined {
  const canonical = readReserveStatusFromRecord(value);
  const label = resolveReserveStatusDisplayLabel(
    canonical !== "unknown" ? canonical : value.reserveStatus ?? value.reserve_status,
  );
  return label || undefined;
}

function normalizeLastSold(
  value: Record<string, unknown> | null | undefined,
): BagLiveLot | null {
  if (!value || typeof value !== "object") return null;
  const lot = normalizeLotRow(value);
  if (!lot) return null;
  const bid = parseBid(value.price);
  return {
    ...lot,
    currentBid: bid.amount ?? lot.currentBid,
    currentBidLabel: bid.label ?? lot.currentBidLabel,
    currency: bid.currency ?? lot.currency,
    sold: true,
  };
}

function normalizeLotList(
  value: Record<string, unknown>[] | null | undefined,
): BagLiveLot[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => normalizeLotRow(row))
    .filter((row): row is BagLiveLot => row !== null);
}

function normalizeLotRow(
  value: Record<string, unknown> | null | undefined,
): BagLiveLot | null {
  if (!value || typeof value !== "object") return null;

  const lotNumber = cleanLotNumber(value.lot);
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const status = typeof value.status === "string" ? value.status.trim() : "";
  const bid = parseBid(value.price);
  const detailUrl =
    typeof value.editUrl === "string"
      ? value.editUrl
      : typeof value.editHref === "string"
        ? value.editHref
        : undefined;

  if (!lotNumber && !title && !bid.label) {
    return null;
  }

  return {
    lotNumber,
    title: title || undefined,
    currentBid: bid.amount,
    currentBidLabel: bid.label,
    currency: bid.currency,
    detailUrl,
    status: status || undefined,
    sold: /sold/i.test(status),
    passed: /pass/i.test(status),
    reserveStatus: resolveReserveStatusLabelFromRow(value),
  };
}

function cleanLotNumber(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^lot\s+/i, "").trim() || trimmed;
}

function parseBid(value: unknown): {
  amount?: number;
  label?: string;
  currency?: string;
} {
  if (typeof value !== "string") return {};
  const label = value.replace(/\s+/g, " ").trim();
  if (!label) return {};

  const match = label.match(/([$€£])?\s*([\d,]+(?:\.\d+)?)/);
  if (!match) {
    return { label };
  }

  const currencySymbol = match[1];
  const amount = Number(match[2].replace(/,/g, ""));
  return {
    amount: Number.isFinite(amount) ? amount : undefined,
    label,
    currency:
      currencySymbol === "$"
        ? "USD"
        : currencySymbol === "€"
          ? "EUR"
          : currencySymbol === "£"
            ? "GBP"
            : undefined,
  };
}
