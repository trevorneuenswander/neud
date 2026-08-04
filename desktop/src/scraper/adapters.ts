export const SCRAPER_ADAPTERS = {
  BAG_AUCTION: "bag-auction",
  GENERIC_WEBPAGE: "generic-webpage",
} as const;

export type ScraperAdapter =
  (typeof SCRAPER_ADAPTERS)[keyof typeof SCRAPER_ADAPTERS];

export const ADAPTER_LABELS: Record<ScraperAdapter, string> = {
  [SCRAPER_ADAPTERS.BAG_AUCTION]: "BAG Auction",
  [SCRAPER_ADAPTERS.GENERIC_WEBPAGE]: "Generic Webpage Scraper",
};

export const PROJECT_TYPE_ADAPTER: Record<string, ScraperAdapter> = {
  "bag-graphics": SCRAPER_ADAPTERS.BAG_AUCTION,
  "webpage-scraper": SCRAPER_ADAPTERS.GENERIC_WEBPAGE,
};

export function isKnownScraperAdapter(
  adapter: unknown,
): adapter is ScraperAdapter {
  return (
    adapter === SCRAPER_ADAPTERS.BAG_AUCTION ||
    adapter === SCRAPER_ADAPTERS.GENERIC_WEBPAGE
  );
}

export function isBagAuctionEngineConfig(
  config: Record<string, unknown> | null | undefined,
): boolean {
  return config?.adapter === SCRAPER_ADAPTERS.BAG_AUCTION;
}

export function isGenericWebpageEngineConfig(
  config: Record<string, unknown> | null | undefined,
): boolean {
  return config?.adapter === SCRAPER_ADAPTERS.GENERIC_WEBPAGE;
}

export type AdapterCompatibilityResult =
  | { ok: true; adapter: ScraperAdapter }
  | { ok: false; code: string; message: string };

export function validateAdapterCompatibility(
  projectType: string,
  adapter: unknown,
): AdapterCompatibilityResult {
  if (typeof adapter !== "string" || !adapter.trim()) {
    return {
      ok: false,
      code: "missing-adapter",
      message:
        "No scraper adapter is configured. Set a valid adapter before starting the engine.",
    };
  }

  if (!isKnownScraperAdapter(adapter)) {
    return {
      ok: false,
      code: "unknown-adapter",
      message: `Unsupported scraper adapter "${adapter}".`,
    };
  }

  const expected = PROJECT_TYPE_ADAPTER[projectType];
  if (!expected) {
    return {
      ok: false,
      code: "unsupported-project-type",
      message: `Project type "${projectType}" does not support webpage scraper adapters.`,
    };
  }

  if (adapter !== expected) {
    return {
      ok: false,
      code: "incompatible-adapter",
      message:
        projectType === "webpage-scraper"
          ? `This generic Webpage Scraper project cannot use the ${ADAPTER_LABELS[SCRAPER_ADAPTERS.BAG_AUCTION]} adapter. Convert it to ${ADAPTER_LABELS[SCRAPER_ADAPTERS.GENERIC_WEBPAGE]} or create a BAG project instead.`
          : `BAG projects must use the ${ADAPTER_LABELS[SCRAPER_ADAPTERS.BAG_AUCTION]} adapter.`,
    };
  }

  return { ok: true, adapter };
}
