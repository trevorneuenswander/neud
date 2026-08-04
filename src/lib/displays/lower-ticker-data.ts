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

function deriveNextFromLots(snapshot: Record<string, unknown>): LowerTickerLot[] {
  const lots = Array.isArray(snapshot.lots)
    ? (snapshot.lots as Record<string, unknown>[])
    : [];
  if (!lots.length) {
    return [];
  }

  let activeIndex = lots.findIndex(
    (row) => row.status && /active/i.test(String(row.status)),
  );

  if (activeIndex < 0 && snapshot.current && typeof snapshot.current === "object") {
    const currentLot = asString(
      (snapshot.current as Record<string, unknown>).lot,
      "",
    ).trim();
    if (currentLot) {
      activeIndex = lots.findIndex((row) => asString(row.lot, "").trim() === currentLot);
    }
  }

  const sliceStart = activeIndex >= 0 ? activeIndex + 1 : 1;
  const sliceEnd = activeIndex >= 0 ? activeIndex + 4 : 4;

  return lots
    .slice(sliceStart, sliceEnd)
    .map((row) => normalizeLot(row))
    .filter((row): row is LowerTickerLot => row !== null)
    .slice(0, 3);
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
): LowerTickerFeedPayload {
  if (!snapshot) {
    return { next: [] };
  }

  if (isTrustedNextArray(snapshot.next)) {
    const fromNext = snapshot.next
      .map((row) => normalizeLot(row))
      .filter((row): row is LowerTickerLot => row !== null)
      .slice(0, 3);
    if (fromNext.length > 0) {
      return { next: fromNext };
    }
  }

  return { next: deriveNextFromLots(snapshot) };
}
