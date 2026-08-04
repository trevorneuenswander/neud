"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BROAD_ARROW_TICKER_RENDERER_KEY = exports.BROAD_ARROW_PYLON_RENDERER_KEY = exports.BROAD_ARROW_UPLOADED_DISPLAY_SPECS = exports.AUCTION_PYLON_DISPLAY_SPEC = exports.AUCTION_TICKER_OVERLAY_SPEC = exports.BROAD_ARROW_UPLOADED_DISPLAYS_IMPORT_KEY = void 0;
exports.rendererKeyForGraphicType = rendererKeyForGraphicType;
exports.BROAD_ARROW_UPLOADED_DISPLAYS_IMPORT_KEY = "phase.broad_arrow_uploaded_displays_v1";
exports.AUCTION_TICKER_OVERLAY_SPEC = {
    importKey: "broad-arrow:auction-ticker-overlay:v1",
    slug: "auction-ticker-overlay",
    name: "Auction Ticker Overlay",
    description: "1920×1080 lower-bar overlay showing up to three upcoming lots with animated title marquee.",
    uploadedFilename: "3. TICKER.html",
    bundledV1RelativePath: "desktop/src/displays/bundled/auction-ticker-overlay-v1.html",
    graphicType: "ticker",
    displayWidth: 1920,
    displayHeight: 1080,
};
/** @deprecated Retired in favor of legacy-pylon HTML display. Kept for cleanup identity matching only. */
exports.AUCTION_PYLON_DISPLAY_SPEC = {
    importKey: "broad-arrow:auction-pylon-display:v1",
    slug: "auction-pylon-display",
    name: "Auction Pylon Display",
    description: "1920×1080 left-side pylon with current lot photo, title, bid, and currency rows.",
    uploadedFilename: "3b. PYLON.html",
    bundledV1RelativePath: "desktop/src/displays/bundled/auction-pylon-display-v1.html",
    graphicType: "pylon",
    displayWidth: 1920,
    displayHeight: 1080,
};
exports.BROAD_ARROW_UPLOADED_DISPLAY_SPECS = [];
/** @deprecated TypeScript Auction Pylon renderer removed. */
exports.BROAD_ARROW_PYLON_RENDERER_KEY = "broad-arrow-pylon";
exports.BROAD_ARROW_TICKER_RENDERER_KEY = "broad-arrow-ticker";
function rendererKeyForGraphicType(graphicType) {
    return graphicType === "ticker"
        ? exports.BROAD_ARROW_TICKER_RENDERER_KEY
        : exports.BROAD_ARROW_PYLON_RENDERER_KEY;
}
