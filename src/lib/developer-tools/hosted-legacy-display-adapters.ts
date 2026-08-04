import {
  LEGACY_PYLON_LIVE_BRIDGE_SCRIPT,
  LEGACY_TICKER_LIVE_BRIDGE_SCRIPT,
} from "./display-runtime-embedded.generated.js";

const LEGACY_SRC_POLLING_TICKER_BLOCK_PATTERN =
  /poll\(\);\s*setInterval\(poll,\s*POLL\);/;

const LEGACY_SRC_POLLING_PYLON_BLOCK_PATTERN =
  /updatePylonHeight\(\);\s*poll\(\);\s*setInterval\(poll,\s*POLL\);\s*window\.addEventListener\('resize',\s*updatePylonHeight\);/;

const LEGACY_TICKER_SCRIPT_PATTERN =
  /(<script(?:\s[^>]*)?>[\s\S]*?function placeNextLots[\s\S]*?<\/script>)/i;

const LEGACY_PYLON_SCRIPT_PATTERN =
  /(<script(?:\s[^>]*)?>[\s\S]*?function render\(feed\)[\s\S]*?<\/script>)/i;

const LEGACY_TICKER_RUNTIME_MANAGED_FLAG =
  '<script>window.__NEUD_RUNTIME_MANAGED_DISPLAY__ = true;</script>';

const LEGACY_PYLON_RUNTIME_MANAGED_FLAG =
  '<script>window.__NEUD_RUNTIME_MANAGED_DISPLAY__ = true;</script>';

export type HostedLegacyDisplayAdapterContext = {
  displaySlug?: string | null;
  projectSlug?: string | null;
};

function isLegacyTickerDisplay(context: HostedLegacyDisplayAdapterContext): boolean {
  const slug = context.displaySlug?.trim().toLowerCase() ?? "";
  return slug === "legacy-ticker" || slug.includes("legacy-ticker");
}

function isLegacyPylonDisplay(context: HostedLegacyDisplayAdapterContext): boolean {
  const slug = context.displaySlug?.trim().toLowerCase() ?? "";
  return slug === "legacy-pylon" || slug.includes("legacy-pylon");
}

function isLegacyTickerHtml(html: string): boolean {
  return /function placeNextLots/.test(html) && /function normalize\(d\)/.test(html);
}

function isLegacyPylonHtml(html: string): boolean {
  return /function render\(feed\)/.test(html) && /feed\?\.auctionDisplay/.test(html);
}

function hasEmbeddedLegacyTickerBridge(html: string): boolean {
  return /initializeNeudTickerBridge/.test(html) || /__NEUD_TICKER_REVISION__/.test(html);
}

function hasEmbeddedLegacyPylonBridge(html: string): boolean {
  return /initializeNeudPylonBridge/.test(html) || /__NEUD_PYLON_REVISION__/.test(html);
}

function injectBeforePattern(html: string, pattern: RegExp, injection: string): string {
  const match = html.match(pattern);
  if (!match || match.index === undefined) {
    return html;
  }
  return `${html.slice(0, match.index)}${injection}\n${html.slice(match.index)}`;
}

function injectAfterPattern(html: string, pattern: RegExp, injection: string): string {
  const match = html.match(pattern);
  if (!match || match.index === undefined) {
    return html;
  }
  const endIndex = match.index + match[0].length;
  return `${html.slice(0, endIndex)}\n${injection}${html.slice(endIndex)}`;
}

function injectBeforeBodyClose(html: string, injection: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${injection}\n</body>`);
  }
  return `${html}\n${injection}`;
}

function neutralizeLegacyTickerPollingStartup(html: string): string {
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

function neutralizeLegacyPylonPollingStartup(html: string): string {
  if (!LEGACY_SRC_POLLING_PYLON_BLOCK_PATTERN.test(html)) {
    return html;
  }

  return html.replace(
    LEGACY_SRC_POLLING_PYLON_BLOCK_PATTERN,
    `updatePylonHeight();
if (!window.__NEUD_RUNTIME_MANAGED_DISPLAY__) {
  poll();
  setInterval(poll, POLL);
}
window.addEventListener('resize', updatePylonHeight);`,
  );
}

function transformLegacyTickerHtmlForHosted(html: string): string {
  if (hasEmbeddedLegacyTickerBridge(html)) {
    return html;
  }
  if (!isLegacyTickerHtml(html)) {
    return html;
  }

  const bridge = LEGACY_TICKER_LIVE_BRIDGE_SCRIPT;
  let result = injectBeforePattern(html, LEGACY_TICKER_SCRIPT_PATTERN, LEGACY_TICKER_RUNTIME_MANAGED_FLAG);
  result = neutralizeLegacyTickerPollingStartup(result);

  if (LEGACY_TICKER_SCRIPT_PATTERN.test(result)) {
    result = injectAfterPattern(result, LEGACY_TICKER_SCRIPT_PATTERN, `<script>${bridge}</script>`);
  } else {
    result = injectBeforeBodyClose(
      result,
      `${LEGACY_TICKER_RUNTIME_MANAGED_FLAG}<script>${bridge}</script>`,
    );
  }

  return result;
}

function transformLegacyPylonHtmlForHosted(html: string): string {
  if (hasEmbeddedLegacyPylonBridge(html)) {
    return html;
  }
  if (!isLegacyPylonHtml(html)) {
    return html;
  }

  const bridge = LEGACY_PYLON_LIVE_BRIDGE_SCRIPT;
  let result = injectBeforePattern(html, LEGACY_PYLON_SCRIPT_PATTERN, LEGACY_PYLON_RUNTIME_MANAGED_FLAG);
  result = neutralizeLegacyPylonPollingStartup(result);

  if (LEGACY_PYLON_SCRIPT_PATTERN.test(result)) {
    result = injectAfterPattern(result, LEGACY_PYLON_SCRIPT_PATTERN, `<script>${bridge}</script>`);
  } else {
    result = injectBeforeBodyClose(
      result,
      `${LEGACY_PYLON_RUNTIME_MANAGED_FLAG}<script>${bridge}</script>`,
    );
  }

  return result;
}

/** Apply legacy hosted bridges so cloud HTML can consume canonical viewer pushes. */
export function applyHostedLegacyDisplayAdapters(
  html: string,
  context: HostedLegacyDisplayAdapterContext = {},
): string {
  let result = html;
  const applyTicker = isLegacyTickerDisplay(context) || isLegacyTickerHtml(html);
  const applyPylon = isLegacyPylonDisplay(context) || isLegacyPylonHtml(html);

  if (applyTicker) {
    result = transformLegacyTickerHtmlForHosted(result);
  }
  if (applyPylon) {
    result = transformLegacyPylonHtmlForHosted(result);
  }
  return result;
}

export function hasHostedLegacyAdapterMarkers(html: string): boolean {
  return hasEmbeddedLegacyTickerBridge(html) || hasEmbeddedLegacyPylonBridge(html);
}
