import {
  buildLowerTickerV5ViewerPath,
  buildNewBidDisplayV1ViewerPath,
  buildNewTickerV1ViewerPath,
  buildPylonViewerPath,
  LOWER_TICKER_V5_DISPLAY_ID,
  NEW_BID_DISPLAY_V1_ID,
  NEW_TICKER_V1_ID,
  PYLON_DISPLAY_ID,
} from "@/lib/displays/registry";

export function resolvePinnedViewerUrl(input: {
  displayKey: string;
  url: string;
}): string {
  if (typeof window === "undefined") {
    return input.url;
  }
  const origin = window.location.origin;
  if (input.displayKey === PYLON_DISPLAY_ID || input.displayKey === "pylon") {
    return buildPylonViewerPath(origin);
  }
  if (input.displayKey === LOWER_TICKER_V5_DISPLAY_ID || input.displayKey === "lower-ticker-v5") {
    return buildLowerTickerV5ViewerPath(origin);
  }
  if (input.displayKey === NEW_BID_DISPLAY_V1_ID || input.displayKey === "new-bid-display-v1") {
    return buildNewBidDisplayV1ViewerPath(origin);
  }
  if (input.displayKey === NEW_TICKER_V1_ID || input.displayKey === "new-ticker-v1") {
    return buildNewTickerV1ViewerPath(origin);
  }
  return input.url;
}
