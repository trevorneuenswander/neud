import { createHash } from "crypto";
import {
  LEGACY_TICKER_MARQUEE_ANCHOR,
  STREAM_BID_BRIDGE_ANCHOR,
  STREAM_TICKER_BRIDGE_ANCHOR,
} from "./stream-display-v2-transform";

export type DisplayRevisionImportDiagnostics = {
  bundledSourceHash: string;
  currentRevisionHash: string | null;
  matchingRevisionFound: boolean;
  duplicateRevisionDetected: boolean;
  duplicateRevisionPrevented: boolean;
  newRevisionCreated: boolean;
  versionBefore: number | null;
  versionAfter: number | null;
  revisionCreationReason: string | null;
};

export function normalizeDisplayHtmlForContentHash(html: string): string {
  let normalized = html.replace(/\r\n/g, "\n");

  normalized = stripInjectedBridgeBlock(normalized, STREAM_BID_BRIDGE_ANCHOR);
  normalized = stripInjectedBridgeBlock(normalized, STREAM_TICKER_BRIDGE_ANCHOR);
  normalized = stripInjectedBridgeBlock(normalized, LEGACY_TICKER_MARQUEE_ANCHOR);

  return normalized.trimEnd();
}

function stripInjectedBridgeBlock(html: string, anchor: string): string {
  if (html.includes(anchor)) {
    return html;
  }

  const anchorIndex = html.indexOf(anchor.replace("/*", "").replace("*/", ""));
  if (anchorIndex >= 0) {
    return html;
  }

  return html;
}

export function hashBundledDisplayContentIdentity(input: {
  importKey: string;
  bundledHtml: string;
}): string {
  const normalized = normalizeDisplayHtmlForContentHash(input.bundledHtml);
  return createHash("sha256")
    .update(`${input.importKey}\n${normalized}\n`)
    .digest("hex");
}

export function hashRuntimeDisplayBundle(input: {
  html: string;
  css?: string;
  javascript?: string;
}): string {
  const normalizedHtml = normalizeDisplayHtmlForContentHash(input.html);
  const css = input.css ?? "";
  const javascript = input.javascript ?? "";
  return createHash("sha256")
    .update(`${normalizedHtml}\n${css}\n${javascript}\n`)
    .digest("hex");
}
