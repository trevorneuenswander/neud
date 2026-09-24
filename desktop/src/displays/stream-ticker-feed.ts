import type { AuctionDayFilter } from "../bag/auction-day-from-lot";
import {
  mapSnapshotToLowerTickerFeed,
  type LowerTickerFeedPayload,
} from "./lower-ticker-data";

export type StreamTickerFeedPayload = LowerTickerFeedPayload;

/** Display-only Stream Ticker JSON feed (canonical snapshot stays unchanged elsewhere). */
export function buildStreamTickerFeed(
  snapshot: Record<string, unknown> | null | undefined,
  dayFilter: AuctionDayFilter,
): StreamTickerFeedPayload {
  return mapSnapshotToLowerTickerFeed(snapshot, { dayFilter });
}

export function attachStreamTickerFeedToBridgePayload(
  bridge: Record<string, unknown>,
  feed: StreamTickerFeedPayload,
): Record<string, unknown> {
  return {
    ...bridge,
    streamTickerFeed: feed,
    next: feed.next,
  };
}
