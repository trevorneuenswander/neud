/**
 * Default BAG scraper source URLs from the reference implementation
 * (auction-ticker-BACKUP/server.js v5.1 and its environment conventions).
 */
export const BAG_AUCTION_SITE_ORIGIN =
  "https://bagauction-jumbotron.auctionaccelerate.com";

export const BAG_DEFAULT_POLL_INTERVAL_MS = 2500;
export const BAG_DEFAULT_DETAILS_TTL_MS = 300000;
export const BAG_DEFAULT_MAX_DETAIL_CHECKS = 8;
export const BAG_DEFAULT_HEADLESS = true;

export type BagSourcePageType =
  | "page"
  | "login"
  | "display"
  | "detail"
  | "detail-template"
  | "custom";

export type BagDefaultScraperSource = {
  sourceKey: string;
  name: string;
  pageType: BagSourcePageType;
  url: string;
  position: number;
  required: boolean;
  description: string;
  adapterConsumed: boolean;
};

export const BAG_REQUIRED_SOURCE_KEYS = [
  "vehicles",
  "login",
  "auction-display",
  "detail-template",
] as const;

export type BagRequiredSourceKey = (typeof BAG_REQUIRED_SOURCE_KEYS)[number];

export const BAG_SYSTEM_SOURCE_KEYS = [
  ...BAG_REQUIRED_SOURCE_KEYS,
] as const;

export const BAG_DETAIL_TEMPLATE_URL = "/vehicles/{vehicleId}/edit";
export const BAG_DETAIL_TEMPLATE_DESCRIPTION =
  "Discovered from links matching /vehicles/{id}/edit";

export const BAG_DEFAULT_SCRAPER_SOURCES: readonly BagDefaultScraperSource[] = [
  {
    sourceKey: "vehicles",
    name: "Auction URL",
    pageType: "page",
    url: `${BAG_AUCTION_SITE_ORIGIN}/vehicles`,
    position: 10,
    required: true,
    description: "Loads the full vehicle table and discovers edit/detail URLs.",
    adapterConsumed: true,
  },
  {
    sourceKey: "login",
    name: "Login URL",
    pageType: "login",
    url: `${BAG_AUCTION_SITE_ORIGIN}/users/sign_in`,
    position: 20,
    required: true,
    description: "Authenticates the scraper and restores expired sessions.",
    adapterConsumed: true,
  },
  {
    sourceKey: "auction-display",
    name: "Auction Display URL",
    pageType: "display",
    url: `${BAG_AUCTION_SITE_ORIGIN}/auctions`,
    position: 30,
    required: true,
    description: "Retrieves live auction display values for vMix graphics.",
    adapterConsumed: true,
  },
  {
    sourceKey: "detail-template",
    name: "Vehicle Detail URLs",
    pageType: "detail-template",
    url: BAG_DETAIL_TEMPLATE_URL,
    position: 40,
    required: true,
    description: BAG_DETAIL_TEMPLATE_DESCRIPTION,
    adapterConsumed: true,
  },
] as const;

export const BAG_LOGIN_CONFIG = {
  usernameSelectors: 'input[type="email"], #user_email, [name="user[email]"]',
  passwordSelectors: 'input[type="password"], #user_password, [name="user[password]"]',
  submitSelectors: 'button[type="submit"], input[type="submit"]',
  successSelector: "#main-container table tbody",
  failureUrlSubstring: "/users/sign_in",
} as const;

export const BAG_SUPPORTED_CUSTOM_SOURCE_TYPES: BagSourcePageType[] = [
  "page",
  "login",
  "display",
  "detail-template",
  "custom",
];

export function isBagSystemSourceKey(sourceKey: string): boolean {
  return BAG_SYSTEM_SOURCE_KEYS.includes(sourceKey as BagRequiredSourceKey);
}

export function isExactBagDefaultSource(sourceKey: string, url: string): boolean {
  const defaults = getBagDefaultSource(sourceKey);
  if (!defaults) return false;
  return defaults.url === url.trim();
}

export function isBagAuctionEngineConfig(
  config: Record<string, unknown> | null | undefined,
): boolean {
  return config?.adapter === "bag-auction";
}

export function getBagDefaultSource(sourceKey: string): BagDefaultScraperSource | null {
  return (
    BAG_DEFAULT_SCRAPER_SOURCES.find((source) => source.sourceKey === sourceKey) ??
    null
  );
}

export function getBagSourceDisplayName(sourceKey: string): string {
  return getBagDefaultSource(sourceKey)?.name ?? sourceKey;
}

export function isRelativeDetailTemplate(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith("/") && !trimmed.includes("://");
}

export function validateDetailTemplateUrl(url: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { ok: false, reason: "Detail URL strategy cannot be empty." };
  }
  if (trimmed.includes("@")) {
    return { ok: false, reason: "Credentials cannot be embedded in URLs." };
  }
  if (/^javascript:/i.test(trimmed)) {
    return { ok: false, reason: "Unsupported URL scheme." };
  }
  if (!isRelativeDetailTemplate(trimmed) && !isValidAbsoluteScraperSourceUrl(trimmed)) {
    return { ok: false, reason: "Detail template must be a safe relative path or absolute URL." };
  }
  if (!trimmed.includes("{vehicleId}") && !trimmed.includes("{id}")) {
    return {
      ok: false,
      reason: "Detail template should include {vehicleId} or {id}.",
    };
  }
  return { ok: true };
}

export function isValidAbsoluteScraperSourceUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function urlContainsEmbeddedCredentials(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed.includes("@")) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    return Boolean(parsed.username || parsed.password);
  } catch {
    return /:\/\/[^/:@]+:[^/@]+@/.test(trimmed);
  }
}

export function validateScraperSourceUrl(
  url: string,
  pageType?: string,
): { ok: true } | { ok: false; reason: string } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { ok: false, reason: "URL is required." };
  }

  if (/^javascript:/i.test(trimmed)) {
    return { ok: false, reason: "Unsupported URL scheme." };
  }

  if (urlContainsEmbeddedCredentials(trimmed)) {
    return { ok: false, reason: "Credentials cannot be embedded in URLs." };
  }

  if (pageType === "detail-template" || isRelativeDetailTemplate(trimmed)) {
    return validateDetailTemplateUrl(trimmed);
  }

  if (!isValidAbsoluteScraperSourceUrl(trimmed)) {
    return { ok: false, reason: "Only http and https URLs are supported." };
  }

  return { ok: true };
}

/** @deprecated Use validateScraperSourceUrl */
export function isValidScraperSourceUrl(url: string): boolean {
  return validateScraperSourceUrl(url).ok;
}

export function isBagDefaultSettings(input: {
  pollIntervalMs: number;
  detailsTtlMs: number;
  maxDetailChecksPerPoll: number;
  headless: boolean;
}): boolean {
  return (
    input.pollIntervalMs === BAG_DEFAULT_POLL_INTERVAL_MS &&
    input.detailsTtlMs === BAG_DEFAULT_DETAILS_TTL_MS &&
    input.maxDetailChecksPerPoll === BAG_DEFAULT_MAX_DETAIL_CHECKS &&
    input.headless === BAG_DEFAULT_HEADLESS
  );
}

export function isUnsetBagPollInterval(value: number | null | undefined): boolean {
  return value == null || value === 5000;
}
