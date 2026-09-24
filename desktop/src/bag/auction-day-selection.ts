import {
  normalizeAuctionDayFilter,
  type AuctionDayFilter,
} from "./auction-day-from-lot";

export const AUCTION_DAY_SELECTION_KEY_PREFIX = "auctionDaySelection";
export const LEGACY_STREAM_TICKER_DAY_FILTER_KEY_PREFIX = "streamTickerDayFilter";

export function auctionDaySelectionSettingKey(projectId: string) {
  return `${AUCTION_DAY_SELECTION_KEY_PREFIX}:${projectId}`;
}

export function legacyStreamTickerDayFilterSettingKey(projectId: string) {
  return `${LEGACY_STREAM_TICKER_DAY_FILTER_KEY_PREFIX}:${projectId}`;
}

function parseAuctionDaySelectionValue(value: unknown): AuctionDayFilter {
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

export type AuctionDaySettingsReader = {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
};

function settingExists<T>(settings: AuctionDaySettingsReader, key: string): boolean {
  const sentinel = Symbol("missing-auction-day-setting");
  return settings.get(key, sentinel as T) !== sentinel;
}

export function readAuctionDaySelectionWithMigration(
  settings: AuctionDaySettingsReader,
  projectId: string,
  availableDays: number[],
): AuctionDayFilter {
  const primaryKey = auctionDaySelectionSettingKey(projectId);
  const legacyKey = legacyStreamTickerDayFilterSettingKey(projectId);

  if (!settingExists(settings, primaryKey) && settingExists(settings, legacyKey)) {
    settings.set(primaryKey, settings.get(legacyKey, "all"));
  }

  const stored = settingExists(settings, primaryKey)
    ? settings.get(primaryKey, "all")
    : settings.get(legacyKey, "all");

  return normalizeAuctionDayFilter(parseAuctionDaySelectionValue(stored), availableDays);
}
