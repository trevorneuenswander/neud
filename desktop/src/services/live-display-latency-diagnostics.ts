export type LiveDisplayLatencyTrace = {
  eventId: string;
  lotNumber: string | null;
  bidLabel: string | null;
  fayeReceivedAt: number | null;
  workerReceivedAt: number | null;
  canonicalUpdatedAt: number | null;
  workerPublishedAt: number | null;
  desktopReceivedAt: number | null;
  sqliteInsertEndAt: number | null;
  displayBridgeEmittedAt: number | null;
  displayBridgeReceivedAt: number | null;
  displayDataFetchedAt: number | null;
  displayRenderedAt: number | null;
  displayDeliveryLagMs: number | null;
  updatedAt: string;
};

export function createEmptyLiveDisplayLatencyTrace(
  eventId: string,
): LiveDisplayLatencyTrace {
  return {
    eventId,
    lotNumber: null,
    bidLabel: null,
    fayeReceivedAt: null,
    workerReceivedAt: null,
    canonicalUpdatedAt: null,
    workerPublishedAt: null,
    desktopReceivedAt: null,
    sqliteInsertEndAt: null,
    displayBridgeEmittedAt: null,
    displayBridgeReceivedAt: null,
    displayDataFetchedAt: null,
    displayRenderedAt: null,
    displayDeliveryLagMs: null,
    updatedAt: new Date().toISOString(),
  };
}

export function readLiveEventFieldsFromSnapshot(
  data: Record<string, unknown> | null | undefined,
): { lotNumber: string | null; bidLabel: string | null } {
  if (!data || typeof data !== "object") {
    return { lotNumber: null, bidLabel: null };
  }
  const auctionDisplay =
    data.auctionDisplay && typeof data.auctionDisplay === "object"
      ? (data.auctionDisplay as Record<string, unknown>)
      : null;
  const current =
    data.current && typeof data.current === "object"
      ? (data.current as Record<string, unknown>)
      : null;
  const lotRaw =
    (typeof auctionDisplay?.lot === "string" && auctionDisplay.lot) ||
    (typeof current?.lot === "string" && current.lot) ||
    null;
  const bidRaw =
    (typeof auctionDisplay?.biddingPrice === "string" && auctionDisplay.biddingPrice) ||
    (typeof auctionDisplay?.currentBid === "string" && auctionDisplay.currentBid) ||
    (typeof auctionDisplay?.price === "string" && auctionDisplay.price) ||
    (typeof current?.price === "string" && current.price) ||
    null;
  return {
    lotNumber: lotRaw?.trim() ? lotRaw.trim() : null,
    bidLabel: bidRaw?.trim() ? bidRaw.trim() : null,
  };
}

export function mergeLiveDisplayLatencyTrace(
  base: LiveDisplayLatencyTrace,
  patch: Partial<LiveDisplayLatencyTrace>,
): LiveDisplayLatencyTrace {
  const merged: LiveDisplayLatencyTrace = {
    ...base,
    ...patch,
    eventId: base.eventId,
    updatedAt: new Date().toISOString(),
  };
  merged.displayDeliveryLagMs = computeDisplayDeliveryLagMs(merged);
  return merged;
}

export function computeDisplayDeliveryLagMs(
  trace: LiveDisplayLatencyTrace,
): number | null {
  const origin =
    trace.fayeReceivedAt ??
    trace.workerReceivedAt ??
    trace.desktopReceivedAt ??
    null;
  const delivered =
    trace.displayRenderedAt ??
    trace.displayDataFetchedAt ??
    trace.displayBridgeReceivedAt ??
    trace.displayBridgeEmittedAt ??
    null;
  if (origin == null || delivered == null) {
    return null;
  }
  const delta = delivered - origin;
  return Number.isFinite(delta) && delta >= 0 ? Math.round(delta) : null;
}

export function formatLiveDisplayLatencySummary(
  trace: LiveDisplayLatencyTrace | null | undefined,
): string | null {
  if (!trace) {
    return null;
  }
  const lag = trace.displayDeliveryLagMs ?? computeDisplayDeliveryLagMs(trace);
  if (lag == null) {
    return null;
  }
  return `${lag} ms`;
}

export function readWorkerLiveTiming(
  value: unknown,
): Partial<LiveDisplayLatencyTrace> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const timing = value as Record<string, unknown>;
  return {
    fayeReceivedAt:
      typeof timing.vendorMessageObservedAt === "number"
        ? timing.vendorMessageObservedAt
        : null,
    workerReceivedAt:
      typeof timing.workerReceivedAt === "number" ? timing.workerReceivedAt : null,
    canonicalUpdatedAt:
      typeof timing.canonicalUpdatedAt === "number"
        ? timing.canonicalUpdatedAt
        : null,
    workerPublishedAt:
      typeof timing.workerPublishedAt === "number" ? timing.workerPublishedAt : null,
  };
}

export function readWorkerTraceEventId(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const traceEventId = (value as Record<string, unknown>).traceEventId;
  return typeof traceEventId === "string" && traceEventId.trim()
    ? traceEventId.trim()
    : null;
}
