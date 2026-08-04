import { formatBidLabel } from "../bag/live-state/bag-manual-validation";

export const DISPLAY_NO_BID_LABEL = "—";

const INVALID_BID_LABELS = new Set([
  "",
  "—",
  "-",
  "$",
  "$0",
  "$0.00",
  "0",
  "0.00",
  "null",
  "undefined",
  "no bid",
  "nan",
  "$nan",
]);

export function parseCanonicalBid(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return Math.round(value);
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  const normalizedLabel = trimmed.toLowerCase();
  if (INVALID_BID_LABELS.has(normalizedLabel)) {
    return null;
  }

  if (/^\$?\s*0(?:\.00)?$/i.test(trimmed)) {
    return null;
  }

  if (/no\s*bid/i.test(trimmed)) {
    return null;
  }

  if (/nan/i.test(trimmed)) {
    return null;
  }

  const digitsOnly = trimmed.replace(/[$€£¥,\s]/g, "");
  if (!digitsOnly || !/^\d+(\.\d+)?$/.test(digitsOnly)) {
    return /\d/.test(trimmed) ? null : null;
  }

  const amount = Number(digitsOnly);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount);
}

export function hasCanonicalBid(value: unknown): boolean {
  return parseCanonicalBid(value) != null;
}

export function normalizeDisplayBid(value: unknown): string {
  const numeric = parseCanonicalBid(value);
  if (numeric == null) {
    return DISPLAY_NO_BID_LABEL;
  }

  return formatBidLabel(numeric);
}

export function resolveCanonicalBidAmount(input: {
  currentBid?: number | null;
  currentBidLabel?: string | null;
  biddingPrice?: unknown;
}): number | null {
  return (
    parseCanonicalBid(input.currentBid) ??
    parseCanonicalBid(input.currentBidLabel) ??
    parseCanonicalBid(input.biddingPrice)
  );
}
