export type DisplayDefinition = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  enabled: boolean;
  viewerPath: string;
  outputUrl: string;
  dataPath: string;
};

export const PYLON_DISPLAY_ID = "pylon";
export const PYLON_DISPLAY_SLUG = "pylon";
export const PYLON_ENABLED_SETTING_KEY = "displays.pylon.enabled";

export const LOWER_TICKER_V5_DISPLAY_ID = "lower-ticker-v5";
export const LOWER_TICKER_V5_DISPLAY_SLUG = "lower-ticker-v5";
export const LOWER_TICKER_V5_ENABLED_SETTING_KEY = "displays.lowerTickerV5.enabled";

export const NEW_BID_DISPLAY_V1_ID = "new-bid-display-v1";
export const NEW_BID_DISPLAY_V1_SLUG = "new-bid-display-v1";
export const NEW_BID_DISPLAY_V1_ENABLED_SETTING_KEY = "displays.newBidDisplayV1.enabled";

export const NEW_TICKER_V1_ID = "new-ticker-v1";
export const NEW_TICKER_V1_SLUG = "new-ticker-v1";
export const NEW_TICKER_V1_ENABLED_SETTING_KEY = "displays.newTickerV1.enabled";

const PYLON_VIEWER_PATH = "/displays/pylon";
const PYLON_DATA_PATH = "/api/displays/pylon/data";

const LOWER_TICKER_V5_VIEWER_PATH = "/displays/lower-ticker-v5";
const LOWER_TICKER_V5_DATA_PATH = "/api/displays/lower-ticker-v5/data";

const NEW_BID_DISPLAY_V1_VIEWER_PATH = "/displays/new-bid-display-v1";
const NEW_BID_DISPLAY_V1_DATA_PATH = "/api/displays/new-bid-display-v1/data";

const NEW_TICKER_V1_VIEWER_PATH = "/displays/new-ticker-v1";
const NEW_TICKER_V1_DATA_PATH = "/api/displays/new-ticker-v1/data";

export function buildPylonViewerPath(baseUrl: string): string {
  const origin = baseUrl.replace(/\/$/, "");
  const dataUrl = `${origin}${PYLON_DATA_PATH}`;
  const params = new URLSearchParams({
    src: dataUrl,
    poll: "1000",
  });
  return `${origin}${PYLON_VIEWER_PATH}?${params.toString()}`;
}

export function buildLowerTickerV5ViewerPath(baseUrl: string): string {
  const origin = baseUrl.replace(/\/$/, "");
  return `${origin}${LOWER_TICKER_V5_VIEWER_PATH}`;
}

export function buildNewBidDisplayV1ViewerPath(baseUrl: string): string {
  const origin = baseUrl.replace(/\/$/, "");
  const dataUrl = `${origin}${NEW_BID_DISPLAY_V1_DATA_PATH}`;
  const params = new URLSearchParams({
    src: dataUrl,
    poll: "1000",
  });
  return `${origin}${NEW_BID_DISPLAY_V1_VIEWER_PATH}?${params.toString()}`;
}

export function buildNewTickerV1ViewerPath(baseUrl: string): string {
  const origin = baseUrl.replace(/\/$/, "");
  const dataUrl = `${origin}${NEW_TICKER_V1_DATA_PATH}`;
  const params = new URLSearchParams({
    src: dataUrl,
    poll: "1000",
  });
  return `${origin}${NEW_TICKER_V1_VIEWER_PATH}?${params.toString()}`;
}

export function buildDisplayRegistry(input: {
  baseUrl: string;
  pylonEnabled?: boolean;
  lowerTickerV5Enabled?: boolean;
  newBidDisplayV1Enabled?: boolean;
  newTickerV1Enabled?: boolean;
}): DisplayDefinition[] {
  const origin = input.baseUrl.replace(/\/$/, "");
  const pylonEnabled = input.pylonEnabled ?? true;
  const lowerTickerV5Enabled = input.lowerTickerV5Enabled ?? true;
  const newBidDisplayV1Enabled = input.newBidDisplayV1Enabled ?? false;
  const newTickerV1Enabled = input.newTickerV1Enabled ?? false;

  return [
    {
      id: PYLON_DISPLAY_ID,
      name: "Pylon v5",
      slug: PYLON_DISPLAY_SLUG,
      description: "Semi-transparent Pylon with Lot Photos and Bidding Data.",
      enabled: pylonEnabled,
      viewerPath: PYLON_VIEWER_PATH,
      dataPath: PYLON_DATA_PATH,
      outputUrl: buildPylonViewerPath(origin),
    },
    {
      id: LOWER_TICKER_V5_DISPLAY_ID,
      name: "Lower Ticker v5",
      slug: LOWER_TICKER_V5_DISPLAY_SLUG,
      description: "Lists the three Up Next Lots",
      enabled: lowerTickerV5Enabled,
      viewerPath: LOWER_TICKER_V5_VIEWER_PATH,
      dataPath: LOWER_TICKER_V5_DATA_PATH,
      outputUrl: buildLowerTickerV5ViewerPath(origin),
    },
    {
      id: NEW_BID_DISPLAY_V1_ID,
      name: "New Bid Display v1",
      slug: NEW_BID_DISPLAY_V1_SLUG,
      description: "3840×2160 primary bid display with transparent lower ticker strip.",
      enabled: newBidDisplayV1Enabled,
      viewerPath: NEW_BID_DISPLAY_V1_VIEWER_PATH,
      dataPath: NEW_BID_DISPLAY_V1_DATA_PATH,
      outputUrl: buildNewBidDisplayV1ViewerPath(origin),
    },
    {
      id: NEW_TICKER_V1_ID,
      name: "New Ticker v1",
      slug: NEW_TICKER_V1_SLUG,
      description: "240px lower upcoming-lot ticker bar.",
      enabled: newTickerV1Enabled,
      viewerPath: NEW_TICKER_V1_VIEWER_PATH,
      dataPath: NEW_TICKER_V1_DATA_PATH,
      outputUrl: buildNewTickerV1ViewerPath(origin),
    },
  ];
}

export function getRegisteredDisplayCount(
  definitions: DisplayDefinition[],
): number {
  return definitions.length;
}

export function getEnabledDisplayCount(
  definitions: DisplayDefinition[],
): number {
  return definitions.filter((display) => display.enabled).length;
}
