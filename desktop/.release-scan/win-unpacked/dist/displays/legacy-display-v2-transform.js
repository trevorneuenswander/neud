"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN = void 0;
exports.readBundledLegacyTickerV1Html = readBundledLegacyTickerV1Html;
exports.readLegacyPylonLiveBridgeScript = readLegacyPylonLiveBridgeScript;
exports.readLegacyPylonV2BridgeScript = readLegacyPylonV2BridgeScript;
exports.readLegacyTickerLiveBridgeScript = readLegacyTickerLiveBridgeScript;
exports.readLegacyTickerV2BridgeScript = readLegacyTickerV2BridgeScript;
exports.transformLegacyPylonHtmlV1ToV2 = transformLegacyPylonHtmlV1ToV2;
exports.transformLegacySrcPollingPylonHtmlV1ToV2 = transformLegacySrcPollingPylonHtmlV1ToV2;
exports.transformLegacySrcPollingTickerHtmlToLiveBridge = transformLegacySrcPollingTickerHtmlToLiveBridge;
exports.transformLegacySrcPollingTickerHtmlV1ToV2 = transformLegacySrcPollingTickerHtmlV1ToV2;
exports.transformLegacyTickerToLiveBridge = transformLegacyTickerToLiveBridge;
exports.isLegacyPylonSelfPollingHtml = isLegacyPylonSelfPollingHtml;
exports.isLegacySrcPollingPylonHtml = isLegacySrcPollingPylonHtml;
exports.isLegacySrcPollingTickerHtml = isLegacySrcPollingTickerHtml;
exports.isLegacyPylonV2Html = isLegacyPylonV2Html;
exports.isLegacyTickerLiveHtml = isLegacyTickerLiveHtml;
exports.hasEmbeddedLegacyPylonBridge = hasEmbeddedLegacyPylonBridge;
exports.hasEmbeddedLegacyTickerBridge = hasEmbeddedLegacyTickerBridge;
exports.neutralizeLegacyPylonPollingStartup = neutralizeLegacyPylonPollingStartup;
exports.rewriteLegacyPylonLogoPathForServing = rewriteLegacyPylonLogoPathForServing;
exports.transformLegacyPylonHtmlForServing = transformLegacyPylonHtmlForServing;
exports.neutralizeLegacyTickerPollingStartup = neutralizeLegacyTickerPollingStartup;
exports.transformLegacyTickerHtmlForServing = transformLegacyTickerHtmlForServing;
exports.isLegacyTickerV2Html = isLegacyTickerV2Html;
exports.isLegacyTickerV3Html = isLegacyTickerV3Html;
exports.transformUploadedDisplayV1ToV2 = transformUploadedDisplayV1ToV2;
exports.transformUploadedDisplayToLatest = transformUploadedDisplayToLatest;
exports.writeBundledLegacyTickerLiveRevision = writeBundledLegacyTickerLiveRevision;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const DISPLAY_CONNECTION_SCRIPT_PATTERN = /<script[^>]*src="[^"]*display-connection\.js[^"]*"[^>]*>\s*<\/script>\s*/gi;
const LEGACY_NEUD_CONNECTION_POLLER_BLOCK_PATTERN = /updatePylonHeight\(\);\s*if \(window\.NEUDDisplayConnection\)[\s\S]*?resizeListenerAttached = true;\s*\}/;
const LEGACY_SRC_POLLING_PYLON_BLOCK_PATTERN = /updatePylonHeight\(\);\s*poll\(\);\s*setInterval\(poll,\s*POLL\);\s*window\.addEventListener\('resize',\s*updatePylonHeight\);/;
exports.LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN = /poll\(\);\s*setInterval\(poll,\s*POLL\);/;
const PYLON_LOGO_FILENAME_PATTERN = /src="26-Broad-Arrow-Auctions-Logo[^"]+\.png"/;
function readBundledLegacyTickerV1Html() {
    return node_fs_1.default.readFileSync(node_path_1.default.join(__dirname, "bundled", "auction-ticker-overlay-v1.html"), "utf8");
}
function readLegacyPylonLiveBridgeScript() {
    return node_fs_1.default.readFileSync(node_path_1.default.join(__dirname, "legacy-pylon-live-bridge.js"), "utf8");
}
function readLegacyPylonV2BridgeScript() {
    return node_fs_1.default.readFileSync(node_path_1.default.join(__dirname, "legacy-pylon-v2-bridge.js"), "utf8");
}
function readLegacyTickerLiveBridgeScript() {
    return node_fs_1.default.readFileSync(node_path_1.default.join(__dirname, "legacy-ticker-live-bridge.js"), "utf8");
}
/** @deprecated Use readLegacyTickerLiveBridgeScript() for new ticker integrations. */
function readLegacyTickerV2BridgeScript() {
    return readLegacyTickerLiveBridgeScript();
}
function transformLegacyPylonHtmlV1ToV2(html, bridgeScript) {
    const bridge = bridgeScript ?? readLegacyPylonV2BridgeScript();
    let result = html.replace(DISPLAY_CONNECTION_SCRIPT_PATTERN, "");
    if (!LEGACY_NEUD_CONNECTION_POLLER_BLOCK_PATTERN.test(result)) {
        throw new Error("Legacy pylon HTML is missing the expected NEUDDisplayConnection initialization block.");
    }
    result = result.replace(LEGACY_NEUD_CONNECTION_POLLER_BLOCK_PATTERN, `updatePylonHeight();\n${bridge}\nif (!resizeListenerAttached) {
  window.addEventListener('resize', updatePylonHeight);
  resizeListenerAttached = true;
}`);
    return result;
}
function transformLegacySrcPollingPylonHtmlV1ToV2(html, bridgeScript) {
    const bridge = bridgeScript ?? readLegacyPylonV2BridgeScript();
    let result = html;
    if (!LEGACY_SRC_POLLING_PYLON_BLOCK_PATTERN.test(result)) {
        throw new Error("Uploaded pylon HTML is missing the expected src-polling initialization block.");
    }
    result = result.replace(LEGACY_SRC_POLLING_PYLON_BLOCK_PATTERN, `updatePylonHeight();\n${bridge}\nwindow.addEventListener('resize', updatePylonHeight);`);
    result = result.replace(PYLON_LOGO_FILENAME_PATTERN, 'src="/displays/pylon/logo.png"');
    return result;
}
function transformLegacySrcPollingTickerHtmlToLiveBridge(html, bridgeScript) {
    const bridge = bridgeScript ?? readLegacyTickerLiveBridgeScript();
    let result = html;
    if (!exports.LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN.test(result)) {
        throw new Error("Uploaded ticker HTML is missing the expected src-polling initialization block.");
    }
    result = result.replace(exports.LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN, `${bridge}`);
    return result;
}
/** @deprecated Use transformLegacySrcPollingTickerHtmlToLiveBridge(). */
function transformLegacySrcPollingTickerHtmlV1ToV2(html, bridgeScript) {
    return transformLegacySrcPollingTickerHtmlToLiveBridge(html, bridgeScript);
}
function transformLegacyTickerToLiveBridge(html, bridgeScript) {
    if (isLegacyTickerLiveHtml(html)) {
        return html;
    }
    let base = html;
    if (isLegacyTickerV2Html(html) ||
        isLegacyTickerV3Html(html) ||
        !exports.LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN.test(html)) {
        base = readBundledLegacyTickerV1Html();
    }
    return transformLegacySrcPollingTickerHtmlToLiveBridge(base, bridgeScript);
}
function isLegacyPylonSelfPollingHtml(html) {
    return (/display-connection\.js/.test(html) &&
        /NEUDDisplayConnection/.test(html) &&
        /function render\(feed\)/.test(html) &&
        /feed\?\.auctionDisplay/.test(html));
}
function isLegacySrcPollingPylonHtml(html) {
    return (/function render\(feed\)/.test(html) &&
        /feed\?\.auctionDisplay/.test(html) &&
        /params\.get\('src'\)/.test(html) &&
        LEGACY_SRC_POLLING_PYLON_BLOCK_PATTERN.test(html));
}
function isLegacySrcPollingTickerHtml(html) {
    return (/function placeNextLots/.test(html) &&
        /function normalize\(d\)/.test(html) &&
        /params\.get\('src'\)/.test(html) &&
        exports.LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN.test(html));
}
function isLegacyPylonV2Html(html) {
    return (/legacy-pylon-v2-bridge/.test(html) ||
        (/NEUD_DATA_UPDATE/.test(html) &&
            /buildAuctionDisplayView/.test(html) &&
            !/NEUDDisplayConnection/.test(html) &&
            !/setInterval\(poll,\s*POLL\)/.test(html)));
}
function isLegacyTickerLiveHtml(html) {
    return (/initializeNeudTickerBridge/.test(html) &&
        /placeNextLots/.test(html) &&
        !/setInterval\(poll,\s*POLL\)/.test(html) &&
        !/function resolveLotNumber/.test(html));
}
function hasEmbeddedLegacyPylonBridge(html) {
    return (/initializeNeudPylonBridge/.test(html) || /__NEUD_PYLON_REVISION__/.test(html));
}
function hasEmbeddedLegacyTickerBridge(html) {
    return (/initializeNeudTickerBridge/.test(html) || /__NEUD_TICKER_REVISION__/.test(html));
}
const LEGACY_PYLON_SCRIPT_PATTERN = /(<script(?:\s[^>]*)?>[\s\S]*?function render\(feed\)[\s\S]*?<\/script>)/i;
const LEGACY_PYLON_RUNTIME_MANAGED_FLAG = '<script>window.__NEUD_RUNTIME_MANAGED_DISPLAY__ = true;</script>';
function neutralizeLegacyPylonPollingStartup(html) {
    if (!exports.LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN.test(html)) {
        return html;
    }
    return html.replace(exports.LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN, `if (!window.__NEUD_RUNTIME_MANAGED_DISPLAY__) {
  poll();
  setInterval(poll, POLL);
}`);
}
function injectBeforeLegacyPylonScript(html, injection) {
    const match = html.match(LEGACY_PYLON_SCRIPT_PATTERN);
    if (!match || match.index === undefined) {
        return html;
    }
    return `${html.slice(0, match.index)}${injection}\n${html.slice(match.index)}`;
}
function injectAfterLegacyPylonScript(html, injection) {
    const match = html.match(LEGACY_PYLON_SCRIPT_PATTERN);
    if (!match || match.index === undefined) {
        return html;
    }
    const endIndex = match.index + match[0].length;
    return `${html.slice(0, endIndex)}\n${injection}${html.slice(endIndex)}`;
}
function rewriteLegacyPylonLogoPathForServing(html) {
    return html.replace(PYLON_LOGO_FILENAME_PATTERN, 'src="/displays/pylon/logo.png"');
}
function transformLegacyPylonHtmlForServing(html, bridgeScript) {
    if (hasEmbeddedLegacyPylonBridge(html)) {
        return html;
    }
    if (!isLegacySrcPollingPylonHtml(html)) {
        return html;
    }
    const bridge = bridgeScript ?? readLegacyPylonLiveBridgeScript();
    let result = injectBeforeLegacyPylonScript(html, LEGACY_PYLON_RUNTIME_MANAGED_FLAG);
    result = neutralizeLegacyPylonPollingStartup(result);
    result = rewriteLegacyPylonLogoPathForServing(result);
    result = injectAfterLegacyPylonScript(result, `<script>${bridge}</script>`);
    return result;
}
const LEGACY_TICKER_SCRIPT_PATTERN = /(<script(?:\s[^>]*)?>[\s\S]*?function placeNextLots[\s\S]*?<\/script>)/i;
const LEGACY_TICKER_RUNTIME_MANAGED_FLAG = '<script>window.__NEUD_RUNTIME_MANAGED_DISPLAY__ = true;</script>';
function neutralizeLegacyTickerPollingStartup(html) {
    if (!exports.LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN.test(html)) {
        return html;
    }
    return html.replace(exports.LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN, `if (!window.__NEUD_RUNTIME_MANAGED_DISPLAY__) {
  poll();
  setInterval(poll, POLL);
}`);
}
function injectBeforeLegacyTickerScript(html, injection) {
    const match = html.match(LEGACY_TICKER_SCRIPT_PATTERN);
    if (!match || match.index === undefined) {
        return html;
    }
    return `${html.slice(0, match.index)}${injection}\n${html.slice(match.index)}`;
}
function injectAfterLegacyTickerScript(html, injection) {
    const match = html.match(LEGACY_TICKER_SCRIPT_PATTERN);
    if (!match || match.index === undefined) {
        return html;
    }
    const endIndex = match.index + match[0].length;
    return `${html.slice(0, endIndex)}\n${injection}${html.slice(endIndex)}`;
}
function transformLegacyTickerHtmlForServing(html, bridgeScript) {
    if (hasEmbeddedLegacyTickerBridge(html)) {
        return html;
    }
    if (!isLegacySrcPollingTickerHtml(html)) {
        return html;
    }
    const bridge = bridgeScript ?? readLegacyTickerLiveBridgeScript();
    let result = injectBeforeLegacyTickerScript(html, LEGACY_TICKER_RUNTIME_MANAGED_FLAG);
    result = neutralizeLegacyTickerPollingStartup(result);
    result = injectAfterLegacyTickerScript(result, `<script>${bridge}</script>`);
    return result;
}
function isLegacyTickerV2Html(html) {
    if (isLegacyTickerLiveHtml(html) || isLegacyTickerV3Html(html)) {
        return false;
    }
    return (/legacy-ticker-v2-bridge/.test(html) ||
        (/NEUD_DISPLAY_READY/.test(html) &&
            /placeNextLots/.test(html) &&
            !/setInterval\(poll,\s*POLL\)/.test(html)));
}
function isLegacyTickerV3Html(html) {
    return (/function resolveLotNumber/.test(html) &&
        /#variant-ticker[\s\S]*box-sizing:\s*content-box/.test(html));
}
function transformUploadedDisplayV1ToV2(html, graphicType, bridgeScript) {
    if (graphicType === "ticker") {
        return transformLegacyTickerToLiveBridge(html, bridgeScript);
    }
    return transformLegacySrcPollingPylonHtmlV1ToV2(html, bridgeScript);
}
function transformUploadedDisplayToLatest(html, graphicType, bridgeScript) {
    if (graphicType === "ticker") {
        return transformLegacyTickerToLiveBridge(html, bridgeScript);
    }
    return isLegacyPylonV2Html(html)
        ? html
        : transformLegacySrcPollingPylonHtmlV1ToV2(html, bridgeScript);
}
function writeBundledLegacyTickerLiveRevision(outputPath) {
    const liveHtml = transformLegacyTickerToLiveBridge(readBundledLegacyTickerV1Html());
    const targetPath = outputPath ??
        node_path_1.default.join(__dirname, "bundled", "auction-ticker-legacy-live-v1-2026-07-26-132400.html");
    node_fs_1.default.writeFileSync(targetPath, liveHtml, "utf8");
    return targetPath;
}
