import type { AuctionDayFilter } from "../bag/auction-day-from-lot";
import {
  mapSnapshotToLowerTickerFeed,
  type LowerTickerFeedPayload,
} from "./lower-ticker-data";
import {
  mapSnapshotToPylonFeed,
  type PylonFeedPayload,
} from "./pylon-data";

export type BroadArrowBridgeDisplayData = {
  pylon: PylonFeedPayload["auctionDisplay"];
  ticker: LowerTickerFeedPayload;
  updatedAt: string | null;
  dataSource: string;
};

export function normalizeBroadArrowDisplayData(
  snapshot: Record<string, unknown> | null | undefined,
  options?: { streamTickerDayFilter?: AuctionDayFilter },
): BroadArrowBridgeDisplayData | null {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const pylonFeed = mapSnapshotToPylonFeed(snapshot);
  const tickerFeed = mapSnapshotToLowerTickerFeed(snapshot, {
    dayFilter: options?.streamTickerDayFilter ?? "all",
  });

  return {
    pylon: pylonFeed.auctionDisplay,
    ticker: tickerFeed,
    updatedAt: typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : null,
    dataSource: typeof snapshot.dataSource === "string" ? snapshot.dataSource : "webpage-scraper",
  };
}
