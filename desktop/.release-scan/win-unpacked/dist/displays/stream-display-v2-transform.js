"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STREAM_TICKER_BRIDGE_ANCHOR = exports.STREAM_BID_BRIDGE_ANCHOR = void 0;
exports.readStreamBidV2BridgeScript = readStreamBidV2BridgeScript;
exports.readStreamTickerV2BridgeScript = readStreamTickerV2BridgeScript;
exports.transformStreamBidHtmlForServing = transformStreamBidHtmlForServing;
exports.transformStreamTickerHtmlForServing = transformStreamTickerHtmlForServing;
exports.isStreamBidRuntimeHtml = isStreamBidRuntimeHtml;
exports.isStreamTickerRuntimeHtml = isStreamTickerRuntimeHtml;
exports.hasEmbeddedStreamBidBridge = hasEmbeddedStreamBidBridge;
exports.hasEmbeddedStreamTickerBridge = hasEmbeddedStreamTickerBridge;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
exports.STREAM_BID_BRIDGE_ANCHOR = "/*__NEUD_STREAM_BID_BRIDGE__*/";
exports.STREAM_TICKER_BRIDGE_ANCHOR = "/*__NEUD_STREAM_TICKER_BRIDGE__*/";
function readStreamBidV2BridgeScript() {
    return node_fs_1.default.readFileSync(node_path_1.default.join(__dirname, "stream-bid-v2-bridge.js"), "utf8");
}
function readStreamTickerV2BridgeScript() {
    return node_fs_1.default.readFileSync(node_path_1.default.join(__dirname, "stream-ticker-v2-bridge.js"), "utf8");
}
function transformStreamBidHtmlForServing(html, bridgeScript) {
    const bridge = bridgeScript ?? readStreamBidV2BridgeScript();
    if (!html.includes(exports.STREAM_BID_BRIDGE_ANCHOR)) {
        if (/stream-bid-v2-bridge/.test(html)) {
            return html;
        }
        throw new Error("Stream Bid Display HTML is missing the runtime bridge anchor.");
    }
    return html.replace(exports.STREAM_BID_BRIDGE_ANCHOR, bridge);
}
function transformStreamTickerHtmlForServing(html, bridgeScript) {
    const bridge = bridgeScript ?? readStreamTickerV2BridgeScript();
    if (!html.includes(exports.STREAM_TICKER_BRIDGE_ANCHOR)) {
        if (/stream-ticker-v2-bridge|initializeNeudStreamTickerBridge/.test(html)) {
            return html;
        }
        throw new Error("Stream Ticker HTML is missing the runtime bridge anchor.");
    }
    return html.replace(exports.STREAM_TICKER_BRIDGE_ANCHOR, bridge);
}
function isStreamBidRuntimeHtml(html) {
    return (/stream-bid-v2-bridge/.test(html) ||
        (/function render\(feed\)/.test(html) &&
            /white-field-composite/.test(html) &&
            !/ticker-bar/.test(html)));
}
function isStreamTickerRuntimeHtml(html) {
    return (/initializeNeudStreamTickerBridge/.test(html) ||
        (/placeNextLots/.test(html) &&
            /stream-ticker-bar/.test(html) &&
            /slice\(0,\s*2\)/.test(html)));
}
function hasEmbeddedStreamBidBridge(html) {
    return /buildAuctionDisplayView/.test(html) && /stream-bid-v2-bridge/.test(html);
}
function hasEmbeddedStreamTickerBridge(html) {
    return /initializeNeudStreamTickerBridge/.test(html);
}
