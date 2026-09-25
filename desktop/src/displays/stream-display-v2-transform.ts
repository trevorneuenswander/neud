import fs from "node:fs";
import path from "node:path";

export const STREAM_BID_BRIDGE_ANCHOR = "/*__NEUD_STREAM_BID_BRIDGE__*/";
export const STREAM_TICKER_BRIDGE_ANCHOR = "/*__NEUD_STREAM_TICKER_BRIDGE__*/";
export const LED_DISPLAY_QUAIL_BRIDGE_ANCHOR = "/*__NEUD_LED_DISPLAY_QUAIL_BRIDGE__*/";
export const LEGACY_TICKER_MARQUEE_ANCHOR = "/*__NEUD_LEGACY_TICKER_MARQUEE__*/";

export function readStreamBidV2BridgeScript(): string {
  return fs.readFileSync(path.join(__dirname, "stream-bid-v2-bridge.js"), "utf8");
}

export function readStreamTickerV2BridgeScript(): string {
  return fs.readFileSync(path.join(__dirname, "stream-ticker-v2-bridge.js"), "utf8");
}

export function readLedDisplayQuailV2BridgeScript(): string {
  return fs.readFileSync(path.join(__dirname, "led-display-quail-v2-bridge.js"), "utf8");
}

export function readLegacyTickerMarqueeScript(): string {
  return fs.readFileSync(path.join(__dirname, "legacy-ticker-marquee.js"), "utf8");
}

export function injectLegacyTickerMarquee(html: string, marqueeScript?: string): string {
  const script = marqueeScript ?? readLegacyTickerMarqueeScript();
  if (!html.includes(LEGACY_TICKER_MARQUEE_ANCHOR)) {
    if (/createLegacyTickerMarquee/.test(html)) {
      return html;
    }
    throw new Error("Stream Ticker HTML is missing the legacy ticker marquee anchor.");
  }
  return html.replace(LEGACY_TICKER_MARQUEE_ANCHOR, script);
}

export function transformStreamBidHtmlForServing(html: string, bridgeScript?: string): string {
  const bridge = bridgeScript ?? readStreamBidV2BridgeScript();
  if (!html.includes(STREAM_BID_BRIDGE_ANCHOR)) {
    if (/stream-bid-v2-bridge/.test(html)) {
      return html;
    }
    throw new Error("Stream Bid Display HTML is missing the runtime bridge anchor.");
  }
  return html.replace(STREAM_BID_BRIDGE_ANCHOR, bridge);
}

export function transformLedDisplayQuailHtmlForServing(
  html: string,
  bridgeScript?: string,
): string {
  const bridge = bridgeScript ?? readLedDisplayQuailV2BridgeScript();
  if (!html.includes(LED_DISPLAY_QUAIL_BRIDGE_ANCHOR)) {
    if (/led-display-quail-v2-bridge/.test(html)) {
      return html;
    }
    throw new Error("LED Display (Quail) HTML is missing the runtime bridge anchor.");
  }
  return html.replace(LED_DISPLAY_QUAIL_BRIDGE_ANCHOR, bridge);
}

export function transformStreamTickerHtmlForServing(html: string, bridgeScript?: string): string {
  const withMarquee = injectLegacyTickerMarquee(html);
  const bridge = bridgeScript ?? readStreamTickerV2BridgeScript();
  if (!withMarquee.includes(STREAM_TICKER_BRIDGE_ANCHOR)) {
    if (/stream-ticker-v2-bridge|initializeNeudStreamTickerBridge/.test(withMarquee)) {
      return withMarquee;
    }
    throw new Error("Stream Ticker HTML is missing the runtime bridge anchor.");
  }
  return withMarquee.replace(STREAM_TICKER_BRIDGE_ANCHOR, bridge);
}

export function isStreamBidRuntimeHtml(html: string): boolean {
  return (
    /stream-bid-v2-bridge/.test(html) ||
    (/function render\(feed\)/.test(html) &&
      /white-field-composite/.test(html) &&
      !/ticker-bar/.test(html))
  );
}

export function isStreamTickerRuntimeHtml(html: string): boolean {
  return (
    /initializeNeudStreamTickerBridge/.test(html) ||
    /stream-ticker-v2-bridge/.test(html) ||
    (/placeNextLots/.test(html) &&
      /stream-ticker-bar/.test(html) &&
      (/createLegacyTickerMarquee/.test(html) || /slice\(0,\s*2\)/.test(html)))
  );
}

export function hasEmbeddedStreamBidBridge(html: string): boolean {
  return /buildAuctionDisplayView/.test(html) && /stream-bid-v2-bridge/.test(html);
}

export function hasEmbeddedStreamTickerBridge(html: string): boolean {
  return /initializeNeudStreamTickerBridge/.test(html);
}
