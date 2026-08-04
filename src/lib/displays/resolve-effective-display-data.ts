import type { DisplayDataSource } from "./display-data-source";
import {
  buildCanonicalProjectSnapshot,
  serializeCanonicalProjectSnapshot,
  type CanonicalProjectData,
} from "./canonical-project-data";
import {
  mapLiveStateToLowerTickerFeed,
  mapSnapshotToLowerTickerFeed,
  type LowerTickerFeedPayload,
} from "./lower-ticker-data";
import {
  mapLiveStateToPylonFeed,
  mapSnapshotToPylonFeed,
  type PylonFeedPayload,
} from "./pylon-data";
import { resolveLocalControllerDisplayData } from "./resolve-local-controller-display-data";

export type EffectiveDisplayLiveState = {
  currentLot?: {
    lotNumber?: string;
    title?: string;
    year?: string;
    reserveStatus?: string;
    currentBidLabel?: string;
    currentBid?: number;
    imageUrl?: string;
  } | null;
  nextLots?: Array<{
    lotNumber?: string;
    title?: string;
    description?: string;
  }>;
  auctionDisplay?: Record<string, unknown> | null;
};

export type EffectiveDisplayData = {
  source: DisplayDataSource;
  scraperSnapshot: Record<string, unknown> | null;
  localControllerState: EffectiveDisplayLiveState | null;
  pylonFeed: PylonFeedPayload;
  lowerTickerFeed: LowerTickerFeedPayload;
  previewSnapshot: Record<string, unknown> | null;
  canonicalSnapshot: CanonicalProjectData | null;
  currency: {
    primary: string;
    displayCurrencies: string[];
    manualBidConversions: string[];
  };
};

function readScraperCurrencies(snapshot: Record<string, unknown> | null): string[] {
  const auctionDisplay =
    snapshot &&
    typeof snapshot.auctionDisplay === "object" &&
    snapshot.auctionDisplay !== null
      ? (snapshot.auctionDisplay as Record<string, unknown>)
      : null;
  if (!auctionDisplay || !Array.isArray(auctionDisplay.currencies)) {
    return [];
  }
  return auctionDisplay.currencies.filter(
    (entry): entry is string => typeof entry === "string",
  );
}

function buildManualBidConversions(
  submittedState?: Record<string, unknown> | null,
): string[] {
  const auctionDisplay =
    submittedState &&
    typeof submittedState.auctionDisplay === "object" &&
    submittedState.auctionDisplay !== null
      ? (submittedState.auctionDisplay as Record<string, unknown>)
      : null;
  if (auctionDisplay && Array.isArray(auctionDisplay.currencies)) {
    return auctionDisplay.currencies.filter(
      (entry): entry is string => typeof entry === "string",
    );
  }

  const conversions = submittedState?.manualBidConversions;
  if (!Array.isArray(conversions)) return [];
  return conversions.filter((entry): entry is string => typeof entry === "string");
}

export function resolveEffectiveDisplayData(input: {
  source: DisplayDataSource;
  scraperSnapshot: Record<string, unknown> | null;
  localControllerState: EffectiveDisplayLiveState | null;
  submittedState?: Record<string, unknown> | null;
  dataset?: Record<string, unknown> | null;
  photoOverrides?: Record<string, unknown> | null;
}): EffectiveDisplayData {
  const localControllerState =
    input.source === "local-controller"
      ? resolveLocalControllerDisplayData({
          submitted: input.submittedState as Parameters<
            typeof resolveLocalControllerDisplayData
          >[0]["submitted"],
          dataset: input.dataset ?? null,
          photoOverrides: input.photoOverrides as Parameters<
            typeof resolveLocalControllerDisplayData
          >[0]["photoOverrides"],
        })
      : input.localControllerState;

  const canonicalSnapshot = serializeCanonicalProjectSnapshot(
    buildCanonicalProjectSnapshot({
      source: input.source,
      scraperSnapshot: input.scraperSnapshot,
      localControllerState,
    }),
  );

  const pylonFeed =
    input.source === "webpage-scraper"
      ? mapSnapshotToPylonFeed(input.scraperSnapshot)
      : mapLiveStateToPylonFeed(localControllerState);

  const lowerTickerFeed =
    input.source === "webpage-scraper"
      ? mapSnapshotToLowerTickerFeed(input.scraperSnapshot)
      : mapLiveStateToLowerTickerFeed(localControllerState);

  const currency =
    input.source === "webpage-scraper"
      ? {
          primary: "USD",
          displayCurrencies: readScraperCurrencies(input.scraperSnapshot),
          manualBidConversions: [],
        }
      : {
          primary: "USD",
          displayCurrencies: buildManualBidConversions(input.submittedState),
          manualBidConversions: buildManualBidConversions(input.submittedState),
        };

  return {
    source: input.source,
    scraperSnapshot: input.scraperSnapshot,
    localControllerState,
    pylonFeed,
    lowerTickerFeed,
    previewSnapshot: canonicalSnapshot,
    canonicalSnapshot,
    currency,
  };
}

export function displayDataSourcePreviewLabel(source: DisplayDataSource): string {
  return source === "local-controller" ? "Local Controller" : "Webpage Scraper";
}
