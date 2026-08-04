"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BROAD_ARROW_STREAM_DISPLAY_SPECS = exports.STREAM_TICKER_DISPLAY_SPEC = exports.STREAM_BID_DISPLAY_SPEC = exports.BROAD_ARROW_STREAM_DISPLAYS_IMPORT_KEY = void 0;
exports.buildStreamDisplayRevisionName = buildStreamDisplayRevisionName;
exports.BROAD_ARROW_STREAM_DISPLAYS_IMPORT_KEY = "phase.broad_arrow_stream_displays_v1";
exports.STREAM_BID_DISPLAY_SPEC = {
    importKey: "broad-arrow:stream-bid-display:v1",
    slug: "stream-bid-display",
    name: "Stream Bid Display",
    description: "3840×2160 Broad Arrow bid display with transparent PIP cutout for live video overlay.",
    bundledRelativePath: "desktop/src/displays/bundled/stream-bid-display-v1.html",
    graphicType: "stream-bid",
    displayWidth: 3840,
    displayHeight: 2160,
};
exports.STREAM_TICKER_DISPLAY_SPEC = {
    importKey: "broad-arrow:stream-ticker:v1",
    slug: "stream-ticker",
    name: "Stream Ticker",
    description: "3840×2160 transparent lower ticker overlay showing the next two upcoming lots.",
    bundledRelativePath: "desktop/src/displays/bundled/stream-ticker-v1.html",
    graphicType: "stream-ticker",
    displayWidth: 3840,
    displayHeight: 2160,
};
exports.BROAD_ARROW_STREAM_DISPLAY_SPECS = [
    exports.STREAM_BID_DISPLAY_SPEC,
    exports.STREAM_TICKER_DISPLAY_SPEC,
];
function buildStreamDisplayRevisionName(prefix) {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${prefix}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
