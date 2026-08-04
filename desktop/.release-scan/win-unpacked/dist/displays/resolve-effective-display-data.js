"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEffectiveDisplayData = resolveEffectiveDisplayData;
const canonical_project_data_1 = require("./canonical-project-data");
const lower_ticker_data_1 = require("./lower-ticker-data");
const pylon_data_1 = require("./pylon-data");
const resolve_local_controller_display_data_1 = require("./resolve-local-controller-display-data");
function readScraperCurrencies(snapshot) {
    const auctionDisplay = snapshot &&
        typeof snapshot.auctionDisplay === "object" &&
        snapshot.auctionDisplay !== null
        ? snapshot.auctionDisplay
        : null;
    if (!auctionDisplay || !Array.isArray(auctionDisplay.currencies)) {
        return [];
    }
    return auctionDisplay.currencies.filter((entry) => typeof entry === "string");
}
function buildManualBidConversions(submittedState) {
    const auctionDisplay = submittedState &&
        typeof submittedState.auctionDisplay === "object" &&
        submittedState.auctionDisplay !== null
        ? submittedState.auctionDisplay
        : null;
    if (auctionDisplay && Array.isArray(auctionDisplay.currencies)) {
        return auctionDisplay.currencies.filter((entry) => typeof entry === "string");
    }
    const conversions = submittedState?.manualBidConversions;
    if (!Array.isArray(conversions))
        return [];
    return conversions.filter((entry) => typeof entry === "string");
}
function resolveEffectiveDisplayData(input) {
    const localControllerState = input.source === "local-controller"
        ? (0, resolve_local_controller_display_data_1.resolveLocalControllerDisplayData)({
            submitted: input.submittedState,
            dataset: input.dataset ?? null,
            photoOverrides: input.photoOverrides ?? null,
        })
        : input.localControllerState;
    const pylonFeed = input.source === "webpage-scraper"
        ? (0, pylon_data_1.mapSnapshotToPylonFeed)(input.scraperSnapshot)
        : (0, pylon_data_1.mapLiveStateToPylonFeed)(localControllerState);
    const lowerTickerFeed = input.source === "webpage-scraper"
        ? (0, lower_ticker_data_1.mapSnapshotToLowerTickerFeed)(input.scraperSnapshot)
        : (0, lower_ticker_data_1.mapLiveStateToLowerTickerFeed)(localControllerState);
    const canonicalSnapshot = (0, canonical_project_data_1.serializeCanonicalProjectSnapshot)((0, canonical_project_data_1.buildCanonicalProjectSnapshot)({
        source: input.source,
        scraperSnapshot: input.scraperSnapshot,
        localControllerState,
    }));
    const currency = input.source === "webpage-scraper"
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
