import type { AuctionDayFilter } from "../bag/auction-day-from-lot";

export const streamTickerDayFilterSettingKey = (projectId: string) =>
  `streamTickerDayFilter:${projectId}`;

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
