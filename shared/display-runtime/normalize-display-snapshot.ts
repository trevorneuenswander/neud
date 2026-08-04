/** Shared canonical → display-runtime snapshot normalization (local + hosted). */

export const DISPLAY_RUNTIME_SNAPSHOT_SHAPE_VERSION = "2026-07-31.1";

export type DisplayRuntimePayloadShape = {
  version: string;
  messageType: string | null;
  revision: number | null;
  topLevelKeys: string[];
  nestedKeys: Record<string, string[]>;
  presence: {
    current: boolean;
    next: boolean;
    prev: boolean;
    lots: boolean;
    auctionDisplay: boolean;
    broadArrowDisplay: boolean;
    snapshot: boolean;
    data: boolean;
    currentLotPresent: boolean;
    currentBidPresent: boolean;
    photoCount: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nestedKeys(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value) : [];
}

function textValue(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function resolvePhotoCount(candidate: Record<string, unknown>): number {
  const auctionDisplay = isRecord(candidate.auctionDisplay) ? candidate.auctionDisplay : null;
  const current = isRecord(candidate.current) ? candidate.current : null;
  const broadArrow = isRecord(candidate.broadArrowDisplay) ? candidate.broadArrowDisplay : null;
  const pylon = broadArrow && isRecord(broadArrow.pylon) ? broadArrow.pylon : null;

  for (const source of [auctionDisplay, current, pylon]) {
    if (source && Array.isArray(source.photos)) {
      return source.photos.filter(Boolean).length;
    }
  }

  return 0;
}

export function hasCanonicalDisplayFields(candidate: Record<string, unknown>): boolean {
  return Boolean(
    candidate.current ||
      candidate.dataSource ||
      Array.isArray(candidate.next) ||
      candidate.auctionDisplay ||
      candidate.broadArrowDisplay ||
      Array.isArray(candidate.lots) ||
      candidate.lastSold ||
      candidate.prev ||
      candidate.pylon ||
      candidate.ticker,
  );
}

/**
 * Converts any inbound bridge/API/published payload into the display-runtime snapshot
 * object consumed by NEUDDisplay._publish and Stream Bid/Ticker adapters.
 */
export function resolveDisplayRuntimeSnapshot(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    return null;
  }

  const candidate =
    isRecord(payload.snapshot) && !Array.isArray(payload.snapshot)
      ? payload.snapshot
      : isRecord(payload.data) && !Array.isArray(payload.data)
        ? payload.data
        : isRecord(payload.broadArrowDisplay) && !Array.isArray(payload.broadArrowDisplay)
          ? payload.broadArrowDisplay
          : payload;

  if (!isRecord(candidate)) {
    return null;
  }

  if (candidate.pylon || candidate.ticker) {
    const merged: Record<string, unknown> = {};
    const pylon = isRecord(candidate.pylon) ? candidate.pylon : null;
    if (pylon) {
      merged.auctionDisplay =
        isRecord(pylon.auctionDisplay) && !Array.isArray(pylon.auctionDisplay)
          ? pylon.auctionDisplay
          : pylon;
    }
    const ticker = isRecord(candidate.ticker) ? candidate.ticker : null;
    if (ticker && Array.isArray(ticker.next)) {
      merged.next = ticker.next;
    }
    if (typeof candidate.updatedAt === "string") {
      merged.updatedAt = candidate.updatedAt;
    }
    merged.dataSource =
      (typeof candidate.dataSource === "string" ? candidate.dataSource : null) ||
      (typeof payload.dataSource === "string" ? payload.dataSource : null);
    if (isRecord(payload.current)) {
      merged.current = payload.current;
    }
    if (isRecord(payload.snapshot) && isRecord(payload.snapshot.current)) {
      merged.current = payload.snapshot.current;
    }
    return merged;
  }

  if (hasCanonicalDisplayFields(candidate)) {
    return candidate;
  }

  return null;
}

export function describeDisplayRuntimePayloadShape(input: {
  payload: unknown;
  messageType?: string | null;
  revision?: number | null;
}): DisplayRuntimePayloadShape {
  const payload = isRecord(input.payload) ? input.payload : null;
  const snapshot = resolveDisplayRuntimeSnapshot(input.payload);

  const current = snapshot && isRecord(snapshot.current) ? snapshot.current : null;
  const auctionDisplay =
    snapshot && isRecord(snapshot.auctionDisplay) ? snapshot.auctionDisplay : null;

  return {
    version: DISPLAY_RUNTIME_SNAPSHOT_SHAPE_VERSION,
    messageType: input.messageType ?? null,
    revision: input.revision ?? null,
    topLevelKeys: payload ? Object.keys(payload) : [],
    nestedKeys: payload
      ? {
          snapshot: nestedKeys(payload.snapshot),
          data: nestedKeys(payload.data),
          current: nestedKeys(payload.current),
          auctionDisplay: nestedKeys(payload.auctionDisplay),
          broadArrowDisplay: nestedKeys(payload.broadArrowDisplay),
        }
      : {},
    presence: {
      current: Boolean(payload?.current),
      next: Array.isArray(payload?.next),
      prev: Boolean(payload?.prev),
      lots: Array.isArray(payload?.lots),
      auctionDisplay: Boolean(payload?.auctionDisplay),
      broadArrowDisplay: Boolean(payload?.broadArrowDisplay),
      snapshot: Boolean(payload?.snapshot),
      data: Boolean(payload?.data),
      currentLotPresent: Boolean(textValue(current?.lot)),
      currentBidPresent: Boolean(
        textValue(current?.price) ||
          textValue(current?.biddingPrice) ||
          textValue(auctionDisplay?.biddingPrice),
      ),
      photoCount: snapshot ? resolvePhotoCount(snapshot) : 0,
    },
  };
}

/** @deprecated Use resolveDisplayRuntimeSnapshot */
export function resolveHostedCanonicalSnapshot(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  return resolveDisplayRuntimeSnapshot(payload);
}
