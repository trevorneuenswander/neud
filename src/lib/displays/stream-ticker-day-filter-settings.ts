import type { AuctionDayFilter } from "@/lib/bag/auction-day-from-lot";
import { normalizeAuctionDayFilter } from "@/lib/bag/auction-day-from-lot";

export const STREAM_TICKER_DAY_FILTER_SETTINGS_KEY = "streamTickerDayFilter";

export function parseStreamTickerDayFilter(value: unknown): AuctionDayFilter {
  if (value === "all" || value === null || value === undefined) {
    return "all";
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "all") {
      return "all";
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return "all";
}

export function normalizeStreamTickerDayFilter(
  filter: AuctionDayFilter,
  availableDays: number[],
): AuctionDayFilter {
  return normalizeAuctionDayFilter(filter, availableDays);
}
