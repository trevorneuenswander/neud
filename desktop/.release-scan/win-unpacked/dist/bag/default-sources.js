"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BAG_SUPPORTED_CUSTOM_SOURCE_TYPES = exports.BAG_LOGIN_CONFIG = exports.BAG_DEFAULT_SCRAPER_SOURCES = exports.BAG_DETAIL_TEMPLATE_DESCRIPTION = exports.BAG_DETAIL_TEMPLATE_URL = exports.BAG_SYSTEM_SOURCE_KEYS = exports.BAG_REQUIRED_SOURCE_KEYS = exports.BAG_DEFAULT_HEADLESS = exports.BAG_DEFAULT_MAX_DETAIL_CHECKS = exports.BAG_DEFAULT_DETAILS_TTL_MS = exports.BAG_DEFAULT_POLL_INTERVAL_MS = exports.BAG_AUCTION_SITE_ORIGIN = void 0;
exports.isBagSystemSourceKey = isBagSystemSourceKey;
exports.isExactBagDefaultSource = isExactBagDefaultSource;
exports.isBagAuctionEngineConfig = isBagAuctionEngineConfig;
exports.getBagDefaultSource = getBagDefaultSource;
exports.getBagSourceDisplayName = getBagSourceDisplayName;
exports.isRelativeDetailTemplate = isRelativeDetailTemplate;
exports.validateDetailTemplateUrl = validateDetailTemplateUrl;
exports.isValidAbsoluteScraperSourceUrl = isValidAbsoluteScraperSourceUrl;
exports.urlContainsEmbeddedCredentials = urlContainsEmbeddedCredentials;
exports.validateScraperSourceUrl = validateScraperSourceUrl;
exports.isValidScraperSourceUrl = isValidScraperSourceUrl;
exports.isBagDefaultSettings = isBagDefaultSettings;
exports.isUnsetBagPollInterval = isUnsetBagPollInterval;
/**
 * Default BAG scraper source URLs from the reference implementation
 * (auction-ticker-BACKUP/server.js v5.1 and its environment conventions).
 */
exports.BAG_AUCTION_SITE_ORIGIN = "https://bagauction-jumbotron.auctionaccelerate.com";
exports.BAG_DEFAULT_POLL_INTERVAL_MS = 2500;
exports.BAG_DEFAULT_DETAILS_TTL_MS = 300000;
exports.BAG_DEFAULT_MAX_DETAIL_CHECKS = 8;
exports.BAG_DEFAULT_HEADLESS = true;
exports.BAG_REQUIRED_SOURCE_KEYS = [
    "vehicles",
    "login",
    "auction-display",
    "detail-template",
];
exports.BAG_SYSTEM_SOURCE_KEYS = [
    ...exports.BAG_REQUIRED_SOURCE_KEYS,
];
exports.BAG_DETAIL_TEMPLATE_URL = "/vehicles/{vehicleId}/edit";
exports.BAG_DETAIL_TEMPLATE_DESCRIPTION = "Discovered from links matching /vehicles/{id}/edit";
exports.BAG_DEFAULT_SCRAPER_SOURCES = [
    {
        sourceKey: "vehicles",
        name: "Auction URL",
        pageType: "page",
        url: `${exports.BAG_AUCTION_SITE_ORIGIN}/vehicles`,
        position: 10,
        required: true,
        description: "Loads the full vehicle table and discovers edit/detail URLs.",
        adapterConsumed: true,
    },
    {
        sourceKey: "login",
        name: "Login URL",
        pageType: "login",
        url: `${exports.BAG_AUCTION_SITE_ORIGIN}/users/sign_in`,
        position: 20,
        required: true,
        description: "Authenticates the scraper and restores expired sessions.",
        adapterConsumed: true,
    },
    {
        sourceKey: "auction-display",
        name: "Auction Display URL",
        pageType: "display",
        url: `${exports.BAG_AUCTION_SITE_ORIGIN}/auctions`,
        position: 30,
        required: true,
        description: "Retrieves live auction display values for vMix graphics.",
        adapterConsumed: true,
    },
    {
        sourceKey: "detail-template",
        name: "Vehicle Detail URLs",
        pageType: "detail-template",
        url: exports.BAG_DETAIL_TEMPLATE_URL,
        position: 40,
        required: true,
        description: exports.BAG_DETAIL_TEMPLATE_DESCRIPTION,
        adapterConsumed: true,
    },
];
exports.BAG_LOGIN_CONFIG = {
    usernameSelectors: 'input[type="email"], #user_email, [name="user[email]"]',
    passwordSelectors: 'input[type="password"], #user_password, [name="user[password]"]',
    submitSelectors: 'button[type="submit"], input[type="submit"]',
    successSelector: "#main-container table tbody",
    failureUrlSubstring: "/users/sign_in",
};
exports.BAG_SUPPORTED_CUSTOM_SOURCE_TYPES = [
    "page",
    "login",
    "display",
    "detail-template",
    "custom",
];
function isBagSystemSourceKey(sourceKey) {
    return exports.BAG_SYSTEM_SOURCE_KEYS.includes(sourceKey);
}
function isExactBagDefaultSource(sourceKey, url) {
    const defaults = getBagDefaultSource(sourceKey);
    if (!defaults)
        return false;
    return defaults.url === url.trim();
}
function isBagAuctionEngineConfig(config) {
    return config?.adapter === "bag-auction";
}
function getBagDefaultSource(sourceKey) {
    return (exports.BAG_DEFAULT_SCRAPER_SOURCES.find((source) => source.sourceKey === sourceKey) ??
        null);
}
function getBagSourceDisplayName(sourceKey) {
    return getBagDefaultSource(sourceKey)?.name ?? sourceKey;
}
function isRelativeDetailTemplate(url) {
    const trimmed = url.trim();
    return trimmed.startsWith("/") && !trimmed.includes("://");
}
function validateDetailTemplateUrl(url) {
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
function isValidAbsoluteScraperSourceUrl(url) {
    const trimmed = url.trim();
    if (!trimmed)
        return false;
    try {
        const parsed = new URL(trimmed);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    }
    catch {
        return false;
    }
}
function urlContainsEmbeddedCredentials(url) {
    const trimmed = url.trim();
    if (!trimmed.includes("@")) {
        return false;
    }
    try {
        const parsed = new URL(trimmed);
        return Boolean(parsed.username || parsed.password);
    }
    catch {
        return /:\/\/[^/:@]+:[^/@]+@/.test(trimmed);
    }
}
function validateScraperSourceUrl(url, pageType) {
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
function isValidScraperSourceUrl(url) {
    return validateScraperSourceUrl(url).ok;
}
function isBagDefaultSettings(input) {
    return (input.pollIntervalMs === exports.BAG_DEFAULT_POLL_INTERVAL_MS &&
        input.detailsTtlMs === exports.BAG_DEFAULT_DETAILS_TTL_MS &&
        input.maxDetailChecksPerPoll === exports.BAG_DEFAULT_MAX_DETAIL_CHECKS &&
        input.headless === exports.BAG_DEFAULT_HEADLESS);
}
function isUnsetBagPollInterval(value) {
    return value == null || value === 5000;
}
