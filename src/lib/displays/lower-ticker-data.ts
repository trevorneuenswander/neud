import {
  getAuctionDayFromLotNumber,
  type AuctionDayFilter,
} from "@/lib/bag/auction-day-from-lot";

export type LowerTickerLot = {
  lot: string;
  title: string;
};

export type LowerTickerFeedPayload = {
  next: LowerTickerLot[];
  source?: string;
};

export type LowerTickerLiveStateInput = {
  nextLots?: Array<{
    lotNumber?: string;
    title?: string;
    description?: string;
  }>;
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeLot(raw: Record<string, unknown>): LowerTickerLot | null {
  const lot = asString(raw.lot ?? raw.lotNumber, "").trim();
  const title = asString(raw.title ?? raw.desc ?? raw.description, "").trim();
  if (!lot && !title) {
    return null;
  }

  return {
    lot: lot || "—",
    title,
  };
}

function isTrustedNextArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.length > 0;
}

function normalizeLotKey(value: unknown): string {
  const cleaned = asString(value, "").trim().replace(/^lot\s+/i, "");
  const numeric = cleaned.match(/\d+/);
  return numeric ? numeric[0] : cleaned.toLowerCase();
}

function resolveCurrentLotIndex(
  lots: Record<string, unknown>[],
  snapshot: Record<string, unknown>,
): number {
  const candidates = [
    asString((snapshot.current as Record<string, unknown> | undefined)?.lot, ""),
    asString(
      (snapshot.auctionDisplay as Record<string, unknown> | undefined)?.lot,
      "",
    ),
  ]
    .map((entry) => normalizeLotKey(entry))
    .filter(Boolean);

  for (const candidate of candidates) {
    const index = lots.findIndex(
      (row) => normalizeLotKey(row.lot ?? row.lotNumber) === candidate,
    );
    if (index >= 0) {
      return index;
    }
  }

  return lots.findIndex((row) => row.status && /active/i.test(String(row.status)));
}

function lotMatchesDayFilter(
  lotValue: unknown,
  dayFilter: AuctionDayFilter,
): boolean {
  if (dayFilter === "all") {
    return true;
  }
  return getAuctionDayFromLotNumber(asString(lotValue, "")) === dayFilter;
}

function deriveNextFromLots(
  snapshot: Record<string, unknown>,
  dayFilter: AuctionDayFilter = "all",
): LowerTickerLot[] {
  const lots = Array.isArray(snapshot.lots)
    ? (snapshot.lots as Record<string, unknown>[])
    : [];
  if (!lots.length) {
    return [];
  }

  const activeIndex = resolveCurrentLotIndex(lots, snapshot);
  const startIndex = activeIndex >= 0 ? activeIndex + 1 : lots.length;

  if (dayFilter !== "all") {
    const upcoming: LowerTickerLot[] = [];
    for (let index = startIndex; index < lots.length && upcoming.length < 3; index += 1) {
      const row = lots[index] as Record<string, unknown>;
      if (!lotMatchesDayFilter(row.lot ?? row.lotNumber, dayFilter)) {
        continue;
      }
      const normalized = normalizeLot(row);
      if (normalized) {
        upcoming.push(normalized);
      }
    }
    return upcoming;
  }
  const upcoming: LowerTickerLot[] = [];

  for (let index = startIndex; index < lots.length && upcoming.length < 3; index += 1) {
    const row = lots[index] as Record<string, unknown>;
    if (!lotMatchesDayFilter(row.lot ?? row.lotNumber, dayFilter)) {
      continue;
    }
    const normalized = normalizeLot(row);
    if (normalized) {
      upcoming.push(normalized);
    }
  }

  return upcoming;
}

export function mapLiveStateToLowerTickerFeed(
  state: LowerTickerLiveStateInput | null | undefined,
): LowerTickerFeedPayload {
  if (!state?.nextLots?.length) {
    return { next: [] };
  }

  return mapSnapshotToLowerTickerFeed({
    next: state.nextLots.map((lot) => ({
      lot: lot.lotNumber ?? "—",
      title: lot.title ?? lot.description ?? "",
    })),
  });
}

export function mapSnapshotToLowerTickerFeed(
  snapshot: Record<string, unknown> | null | undefined,
  options?: { dayFilter?: AuctionDayFilter },
): LowerTickerFeedPayload {
  if (!snapshot) {
    return { next: [] };
  }

  const dayFilter = options?.dayFilter ?? "all";

  if (dayFilter === "all" && isTrustedNextArray(snapshot.next)) {
    const fromNext = snapshot.next
      .map((row) => normalizeLot(row))
      .filter((row): row is LowerTickerLot => row !== null)
      .slice(0, 3);
    if (fromNext.length > 0) {
      return { next: fromNext };
    }
  }

  return { next: deriveNextFromLots(snapshot, dayFilter) };
}
