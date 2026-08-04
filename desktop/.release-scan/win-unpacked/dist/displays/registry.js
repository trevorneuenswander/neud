"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEW_TICKER_V1_ENABLED_SETTING_KEY = exports.NEW_TICKER_V1_SLUG = exports.NEW_TICKER_V1_ID = exports.NEW_BID_DISPLAY_V1_ENABLED_SETTING_KEY = exports.NEW_BID_DISPLAY_V1_SLUG = exports.NEW_BID_DISPLAY_V1_ID = exports.LOWER_TICKER_V5_ENABLED_SETTING_KEY = exports.LOWER_TICKER_V5_DISPLAY_SLUG = exports.LOWER_TICKER_V5_DISPLAY_ID = exports.PYLON_ENABLED_SETTING_KEY = exports.PYLON_DISPLAY_SLUG = exports.PYLON_DISPLAY_ID = void 0;
exports.buildPylonViewerPath = buildPylonViewerPath;
exports.buildLowerTickerV5ViewerPath = buildLowerTickerV5ViewerPath;
exports.buildNewBidDisplayV1ViewerPath = buildNewBidDisplayV1ViewerPath;
exports.buildNewTickerV1ViewerPath = buildNewTickerV1ViewerPath;
exports.buildDisplayRegistry = buildDisplayRegistry;
exports.getRegisteredDisplayCount = getRegisteredDisplayCount;
exports.getEnabledDisplayCount = getEnabledDisplayCount;
exports.PYLON_DISPLAY_ID = "pylon";
exports.PYLON_DISPLAY_SLUG = "pylon";
exports.PYLON_ENABLED_SETTING_KEY = "displays.pylon.enabled";
exports.LOWER_TICKER_V5_DISPLAY_ID = "lower-ticker-v5";
exports.LOWER_TICKER_V5_DISPLAY_SLUG = "lower-ticker-v5";
exports.LOWER_TICKER_V5_ENABLED_SETTING_KEY = "displays.lowerTickerV5.enabled";
exports.NEW_BID_DISPLAY_V1_ID = "new-bid-display-v1";
exports.NEW_BID_DISPLAY_V1_SLUG = "new-bid-display-v1";
exports.NEW_BID_DISPLAY_V1_ENABLED_SETTING_KEY = "displays.newBidDisplayV1.enabled";
exports.NEW_TICKER_V1_ID = "new-ticker-v1";
exports.NEW_TICKER_V1_SLUG = "new-ticker-v1";
exports.NEW_TICKER_V1_ENABLED_SETTING_KEY = "displays.newTickerV1.enabled";
const PYLON_VIEWER_PATH = "/displays/pylon";
const PYLON_DATA_PATH = "/api/displays/pylon/data";
const LOWER_TICKER_V5_VIEWER_PATH = "/displays/lower-ticker-v5";
const LOWER_TICKER_V5_DATA_PATH = "/api/displays/lower-ticker-v5/data";
const NEW_BID_DISPLAY_V1_VIEWER_PATH = "/displays/new-bid-display-v1";
const NEW_BID_DISPLAY_V1_DATA_PATH = "/api/displays/new-bid-display-v1/data";
const NEW_TICKER_V1_VIEWER_PATH = "/displays/new-ticker-v1";
const NEW_TICKER_V1_DATA_PATH = "/api/displays/new-ticker-v1/data";
function buildPylonViewerPath(baseUrl) {
    const origin = baseUrl.replace(/\/$/, "");
    const dataUrl = `${origin}${PYLON_DATA_PATH}`;
    const params = new URLSearchParams({
        src: dataUrl,
        poll: "1000",
    });
    return `${origin}${PYLON_VIEWER_PATH}?${params.toString()}`;
}
function buildLowerTickerV5ViewerPath(baseUrl) {
    const origin = baseUrl.replace(/\/$/, "");
    return `${origin}${LOWER_TICKER_V5_VIEWER_PATH}`;
}
function buildNewBidDisplayV1ViewerPath(baseUrl) {
    const origin = baseUrl.replace(/\/$/, "");
    const dataUrl = `${origin}${NEW_BID_DISPLAY_V1_DATA_PATH}`;
    const params = new URLSearchParams({
        src: dataUrl,
        poll: "1000",
    });
    return `${origin}${NEW_BID_DISPLAY_V1_VIEWER_PATH}?${params.toString()}`;
}
function buildNewTickerV1ViewerPath(baseUrl) {
    const origin = baseUrl.replace(/\/$/, "");
    const dataUrl = `${origin}${NEW_TICKER_V1_DATA_PATH}`;
    const params = new URLSearchParams({
        src: dataUrl,
        poll: "1000",
    });
    return `${origin}${NEW_TICKER_V1_VIEWER_PATH}?${params.toString()}`;
}
function buildDisplayRegistry(input) {
    const origin = input.baseUrl.replace(/\/$/, "");
    const pylonEnabled = input.pylonEnabled ?? true;
    const lowerTickerV5Enabled = input.lowerTickerV5Enabled ?? true;
    const newBidDisplayV1Enabled = input.newBidDisplayV1Enabled ?? false;
    const newTickerV1Enabled = input.newTickerV1Enabled ?? false;
    return [
        {
            id: exports.PYLON_DISPLAY_ID,
            name: "Pylon v5",
            slug: exports.PYLON_DISPLAY_SLUG,
            description: "Semi-transparent Pylon with Lot Photos and Bidding Data.",
            enabled: pylonEnabled,
            viewerPath: PYLON_VIEWER_PATH,
            dataPath: PYLON_DATA_PATH,
            outputUrl: buildPylonViewerPath(origin),
        },
        {
            id: exports.LOWER_TICKER_V5_DISPLAY_ID,
            name: "Lower Ticker v5",
            slug: exports.LOWER_TICKER_V5_DISPLAY_SLUG,
            description: "Lists the three Up Next Lots",
            enabled: lowerTickerV5Enabled,
            viewerPath: LOWER_TICKER_V5_VIEWER_PATH,
            dataPath: LOWER_TICKER_V5_DATA_PATH,
            outputUrl: buildLowerTickerV5ViewerPath(origin),
        },
        {
            id: exports.NEW_BID_DISPLAY_V1_ID,
            name: "New Bid Display v1",
            slug: exports.NEW_BID_DISPLAY_V1_SLUG,
            description: "3840×2160 primary bid display with transparent lower ticker strip.",
            enabled: newBidDisplayV1Enabled,
            viewerPath: NEW_BID_DISPLAY_V1_VIEWER_PATH,
            dataPath: NEW_BID_DISPLAY_V1_DATA_PATH,
            outputUrl: buildNewBidDisplayV1ViewerPath(origin),
        },
        {
            id: exports.NEW_TICKER_V1_ID,
            name: "New Ticker v1",
            slug: exports.NEW_TICKER_V1_SLUG,
            description: "240px lower upcoming-lot ticker bar.",
            enabled: newTickerV1Enabled,
            viewerPath: NEW_TICKER_V1_VIEWER_PATH,
            dataPath: NEW_TICKER_V1_DATA_PATH,
            outputUrl: buildNewTickerV1ViewerPath(origin),
        },
    ];
}
function getRegisteredDisplayCount(definitions) {
    return definitions.length;
}
function getEnabledDisplayCount(definitions) {
    return definitions.filter((display) => display.enabled).length;
}
