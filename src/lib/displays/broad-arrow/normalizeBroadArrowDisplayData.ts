import type { CanonicalProjectData } from "@/lib/displays/canonical-project-data";
import {
  mapSnapshotToLowerTickerFeed,
  type LowerTickerFeedPayload,
} from "@/lib/displays/lower-ticker-data";
import {
  mapSnapshotToPylonFeed,
  type PylonFeedPayload,
} from "@/lib/displays/pylon-data";
import {
  EMPTY_BROAD_ARROW_DISPLAY_DATA,
  type BroadArrowDisplayData,
} from "./types";

function readUpdatedAt(snapshot: Record<string, unknown>): string | null {
  return typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : null;
}

function readDataSource(snapshot: Record<string, unknown>): string {
  return typeof snapshot.dataSource === "string" ? snapshot.dataSource : "webpage-scraper";
}

export function normalizeBroadArrowDisplayData(
  canonical: CanonicalProjectData | Record<string, unknown> | null | undefined,
): BroadArrowDisplayData {
  if (!canonical || typeof canonical !== "object") {
    return { ...EMPTY_BROAD_ARROW_DISPLAY_DATA };
  }

  const snapshot = canonical as Record<string, unknown>;
  const pylonFeed: PylonFeedPayload = mapSnapshotToPylonFeed(snapshot);
  const tickerFeed: LowerTickerFeedPayload = mapSnapshotToLowerTickerFeed(snapshot);

  return {
    pylon: pylonFeed.auctionDisplay,
    ticker: {
      next: tickerFeed.next,
    },
    updatedAt: readUpdatedAt(snapshot),
    dataSource: readDataSource(snapshot),
  };
}

export function broadArrowDisplayDataHasLiveContent(data: BroadArrowDisplayData): boolean {
  const pylon = data.pylon;
  const hasPylon = Boolean(
    pylon.title ||
      (pylon.lot && pylon.lot !== "Lot —") ||
      pylon.biddingPrice ||
      pylon.photos.length > 0,
  );
  const hasTicker = data.ticker.next.length > 0;
  return hasPylon || hasTicker;
}
