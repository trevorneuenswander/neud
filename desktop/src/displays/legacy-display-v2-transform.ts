import fs from "node:fs";
import path from "node:path";

const DISPLAY_CONNECTION_SCRIPT_PATTERN =
  /<script[^>]*src="[^"]*display-connection\.js[^"]*"[^>]*>\s*<\/script>\s*/gi;

const LEGACY_NEUD_CONNECTION_POLLER_BLOCK_PATTERN =
  /updatePylonHeight\(\);\s*if \(window\.NEUDDisplayConnection\)[\s\S]*?resizeListenerAttached = true;\s*\}/;

const LEGACY_SRC_POLLING_PYLON_BLOCK_PATTERN =
  /updatePylonHeight\(\);\s*poll\(\);\s*setInterval\(poll,\s*POLL\);\s*window\.addEventListener\('resize',\s*updatePylonHeight\);/;

export const LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN =
  /poll\(\);\s*setInterval\(poll,\s*POLL\);/;

const PYLON_LOGO_FILENAME_PATTERN =
  /src="26-Broad-Arrow-Auctions-Logo[^"]+\.png"/;

export function readBundledLegacyTickerV1Html(): string {
  return fs.readFileSync(
    path.join(__dirname, "bundled", "auction-ticker-overlay-v1.html"),
    "utf8",
  );
}

export function readLegacyPylonLiveBridgeScript(): string {
  return fs.readFileSync(
    path.join(__dirname, "legacy-pylon-live-bridge.js"),
    "utf8",
  );
}

export function readLegacyPylonV2BridgeScript(): string {
  return fs.readFileSync(
    path.join(__dirname, "legacy-pylon-v2-bridge.js"),
    "utf8",
  );
}

export function readLegacyTickerLiveBridgeScript(): string {
  return fs.readFileSync(
    path.join(__dirname, "legacy-ticker-live-bridge.js"),
    "utf8",
  );
}

/** @deprecated Use readLegacyTickerLiveBridgeScript() for new ticker integrations. */
export function readLegacyTickerV2BridgeScript(): string {
  return readLegacyTickerLiveBridgeScript();
}

export function transformLegacyPylonHtmlV1ToV2(html: string, bridgeScript?: string): string {
  const bridge = bridgeScript ?? readLegacyPylonV2BridgeScript();
  let result = html.replace(DISPLAY_CONNECTION_SCRIPT_PATTERN, "");

  if (!LEGACY_NEUD_CONNECTION_POLLER_BLOCK_PATTERN.test(result)) {
    throw new Error(
      "Legacy pylon HTML is missing the expected NEUDDisplayConnection initialization block.",
    );
  }

  result = result.replace(
    LEGACY_NEUD_CONNECTION_POLLER_BLOCK_PATTERN,
    `updatePylonHeight();\n${bridge}\nif (!resizeListenerAttached) {
  window.addEventListener('resize', updatePylonHeight);
  resizeListenerAttached = true;
}`,
  );

  return result;
}

export function transformLegacySrcPollingPylonHtmlV1ToV2(
  html: string,
  bridgeScript?: string,
): string {
  const bridge = bridgeScript ?? readLegacyPylonV2BridgeScript();
  let result = html;

  if (!LEGACY_SRC_POLLING_PYLON_BLOCK_PATTERN.test(result)) {
    throw new Error(
      "Uploaded pylon HTML is missing the expected src-polling initialization block.",
    );
  }

  result = result.replace(
    LEGACY_SRC_POLLING_PYLON_BLOCK_PATTERN,
    `updatePylonHeight();\n${bridge}\nwindow.addEventListener('resize', updatePylonHeight);`,
  );

  result = result.replace(
    PYLON_LOGO_FILENAME_PATTERN,
    'src="/displays/pylon/logo.png"',
  );

  return result;
}

export function transformLegacySrcPollingTickerHtmlToLiveBridge(
  html: string,
  bridgeScript?: string,
): string {
  const bridge = bridgeScript ?? readLegacyTickerLiveBridgeScript();
  let result = html;

  if (!LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN.test(result)) {
    throw new Error(
      "Uploaded ticker HTML is missing the expected src-polling initialization block.",
    );
  }

  result = result.replace(LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN, `${bridge}`);

  return result;
}

/** @deprecated Use transformLegacySrcPollingTickerHtmlToLiveBridge(). */
export function transformLegacySrcPollingTickerHtmlV1ToV2(
  html: string,
  bridgeScript?: string,
): string {
  return transformLegacySrcPollingTickerHtmlToLiveBridge(html, bridgeScript);
}

export function transformLegacyTickerToLiveBridge(
  html: string,
  bridgeScript?: string,
): string {
  if (isLegacyTickerLiveHtml(html)) {
    return html;
  }

  let base = html;
  if (
    isLegacyTickerV2Html(html) ||
    isLegacyTickerV3Html(html) ||
    !LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN.test(html)
  ) {
    base = readBundledLegacyTickerV1Html();
  }

  return transformLegacySrcPollingTickerHtmlToLiveBridge(base, bridgeScript);
}

export function isLegacyPylonSelfPollingHtml(html: string): boolean {
  return (
    /display-connection\.js/.test(html) &&
    /NEUDDisplayConnection/.test(html) &&
    /function render\(feed\)/.test(html) &&
    /feed\?\.auctionDisplay/.test(html)
  );
}

export function isLegacySrcPollingPylonHtml(html: string): boolean {
  return (
    /function render\(feed\)/.test(html) &&
    /feed\?\.auctionDisplay/.test(html) &&
    /params\.get\('src'\)/.test(html) &&
    LEGACY_SRC_POLLING_PYLON_BLOCK_PATTERN.test(html)
  );
}

export function isLegacySrcPollingTickerHtml(html: string): boolean {
  return (
    /function placeNextLots/.test(html) &&
    /function normalize\(d\)/.test(html) &&
    /params\.get\('src'\)/.test(html) &&
    LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN.test(html)
  );
}

export function isLegacyPylonV2Html(html: string): boolean {
  return (
    /legacy-pylon-v2-bridge/.test(html) ||
    (/NEUD_DATA_UPDATE/.test(html) &&
      /buildAuctionDisplayView/.test(html) &&
      !/NEUDDisplayConnection/.test(html) &&
      !/setInterval\(poll,\s*POLL\)/.test(html))
  );
}

export function isLegacyTickerLiveHtml(html: string): boolean {
  return (
    /initializeNeudTickerBridge/.test(html) &&
    /placeNextLots/.test(html) &&
    !/setInterval\(poll,\s*POLL\)/.test(html) &&
    !/function resolveLotNumber/.test(html)
  );
}

export function hasEmbeddedLegacyPylonBridge(html: string): boolean {
  return (
    /initializeNeudPylonBridge/.test(html) || /__NEUD_PYLON_REVISION__/.test(html)
  );
}

export function hasEmbeddedLegacyTickerBridge(html: string): boolean {
  return (
    /initializeNeudTickerBridge/.test(html) || /__NEUD_TICKER_REVISION__/.test(html)
  );
}

const LEGACY_PYLON_SCRIPT_PATTERN =
  /(<script(?:\s[^>]*)?>[\s\S]*?function render\(feed\)[\s\S]*?<\/script>)/i;

const LEGACY_PYLON_RUNTIME_MANAGED_FLAG =
  '<script>window.__NEUD_RUNTIME_MANAGED_DISPLAY__ = true;</script>';

export function neutralizeLegacyPylonPollingStartup(html: string): string {
  if (!LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN.test(html)) {
    return html;
  }

  return html.replace(
    LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN,
    `if (!window.__NEUD_RUNTIME_MANAGED_DISPLAY__) {
  poll();
  setInterval(poll, POLL);
}`,
  );
}

function injectBeforeLegacyPylonScript(html: string, injection: string): string {
  const match = html.match(LEGACY_PYLON_SCRIPT_PATTERN);
  if (!match || match.index === undefined) {
    return html;
  }

  return `${html.slice(0, match.index)}${injection}\n${html.slice(match.index)}`;
}

function injectAfterLegacyPylonScript(html: string, injection: string): string {
  const match = html.match(LEGACY_PYLON_SCRIPT_PATTERN);
  if (!match || match.index === undefined) {
    return html;
  }

  const endIndex = match.index + match[0].length;
  return `${html.slice(0, endIndex)}\n${injection}${html.slice(endIndex)}`;
}

export function rewriteLegacyPylonLogoPathForServing(html: string): string {
  return html.replace(
    PYLON_LOGO_FILENAME_PATTERN,
    'src="/displays/pylon/logo.png"',
  );
}

export function transformLegacyPylonHtmlForServing(html: string, bridgeScript?: string): string {
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

const LEGACY_TICKER_SCRIPT_PATTERN =
  /(<script(?:\s[^>]*)?>[\s\S]*?function placeNextLots[\s\S]*?<\/script>)/i;

const LEGACY_TICKER_RUNTIME_MANAGED_FLAG =
  '<script>window.__NEUD_RUNTIME_MANAGED_DISPLAY__ = true;</script>';

export function neutralizeLegacyTickerPollingStartup(html: string): string {
  if (!LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN.test(html)) {
    return html;
  }

  return html.replace(
    LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN,
    `if (!window.__NEUD_RUNTIME_MANAGED_DISPLAY__) {
  poll();
  setInterval(poll, POLL);
}`,
  );
}

function injectBeforeLegacyTickerScript(html: string, injection: string): string {
  const match = html.match(LEGACY_TICKER_SCRIPT_PATTERN);
  if (!match || match.index === undefined) {
    return html;
  }

  return `${html.slice(0, match.index)}${injection}\n${html.slice(match.index)}`;
}

function injectAfterLegacyTickerScript(html: string, injection: string): string {
  const match = html.match(LEGACY_TICKER_SCRIPT_PATTERN);
  if (!match || match.index === undefined) {
    return html;
  }

  const endIndex = match.index + match[0].length;
  return `${html.slice(0, endIndex)}\n${injection}${html.slice(endIndex)}`;
}

export function transformLegacyTickerHtmlForServing(html: string, bridgeScript?: string): string {
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

export function isLegacyTickerV2Html(html: string): boolean {
  if (isLegacyTickerLiveHtml(html) || isLegacyTickerV3Html(html)) {
    return false;
  }

  return (
    /legacy-ticker-v2-bridge/.test(html) ||
    (/NEUD_DISPLAY_READY/.test(html) &&
      /placeNextLots/.test(html) &&
      !/setInterval\(poll,\s*POLL\)/.test(html))
  );
}

export function isLegacyTickerV3Html(html: string): boolean {
  return (
    /function resolveLotNumber/.test(html) &&
    /#variant-ticker[\s\S]*box-sizing:\s*content-box/.test(html)
  );
}

export function transformUploadedDisplayV1ToV2(
  html: string,
  graphicType: "ticker" | "pylon",
  bridgeScript?: string,
): string {
  if (graphicType === "ticker") {
    return transformLegacyTickerToLiveBridge(html, bridgeScript);
  }
  return transformLegacySrcPollingPylonHtmlV1ToV2(html, bridgeScript);
}

export function transformUploadedDisplayToLatest(
  html: string,
  graphicType: "ticker" | "pylon",
  bridgeScript?: string,
): string {
  if (graphicType === "ticker") {
    return transformLegacyTickerToLiveBridge(html, bridgeScript);
  }

  return isLegacyPylonV2Html(html)
    ? html
    : transformLegacySrcPollingPylonHtmlV1ToV2(html, bridgeScript);
}

export function writeBundledLegacyTickerLiveRevision(outputPath?: string): string {
  const liveHtml = transformLegacyTickerToLiveBridge(readBundledLegacyTickerV1Html());
  const targetPath =
    outputPath ??
    path.join(__dirname, "bundled", "auction-ticker-legacy-live-v1-2026-07-26-132400.html");

  fs.writeFileSync(targetPath, liveHtml, "utf8");
  return targetPath;
}
