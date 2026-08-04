"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROJECT_TYPE_ADAPTER = exports.ADAPTER_LABELS = exports.SCRAPER_ADAPTERS = void 0;
exports.isKnownScraperAdapter = isKnownScraperAdapter;
exports.isBagAuctionEngineConfig = isBagAuctionEngineConfig;
exports.isGenericWebpageEngineConfig = isGenericWebpageEngineConfig;
exports.validateAdapterCompatibility = validateAdapterCompatibility;
exports.SCRAPER_ADAPTERS = {
    BAG_AUCTION: "bag-auction",
    GENERIC_WEBPAGE: "generic-webpage",
};
exports.ADAPTER_LABELS = {
    [exports.SCRAPER_ADAPTERS.BAG_AUCTION]: "BAG Auction",
    [exports.SCRAPER_ADAPTERS.GENERIC_WEBPAGE]: "Generic Webpage Scraper",
};
exports.PROJECT_TYPE_ADAPTER = {
    "bag-graphics": exports.SCRAPER_ADAPTERS.BAG_AUCTION,
    "webpage-scraper": exports.SCRAPER_ADAPTERS.GENERIC_WEBPAGE,
};
function isKnownScraperAdapter(adapter) {
    return (adapter === exports.SCRAPER_ADAPTERS.BAG_AUCTION ||
        adapter === exports.SCRAPER_ADAPTERS.GENERIC_WEBPAGE);
}
function isBagAuctionEngineConfig(config) {
    return config?.adapter === exports.SCRAPER_ADAPTERS.BAG_AUCTION;
}
function isGenericWebpageEngineConfig(config) {
    return config?.adapter === exports.SCRAPER_ADAPTERS.GENERIC_WEBPAGE;
}
function validateAdapterCompatibility(projectType, adapter) {
    if (typeof adapter !== "string" || !adapter.trim()) {
        return {
            ok: false,
            code: "missing-adapter",
            message: "No scraper adapter is configured. Set a valid adapter before starting the engine.",
        };
    }
    if (!isKnownScraperAdapter(adapter)) {
        return {
            ok: false,
            code: "unknown-adapter",
            message: `Unsupported scraper adapter "${adapter}".`,
        };
    }
    const expected = exports.PROJECT_TYPE_ADAPTER[projectType];
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
            message: projectType === "webpage-scraper"
                ? `This generic Webpage Scraper project cannot use the ${exports.ADAPTER_LABELS[exports.SCRAPER_ADAPTERS.BAG_AUCTION]} adapter. Convert it to ${exports.ADAPTER_LABELS[exports.SCRAPER_ADAPTERS.GENERIC_WEBPAGE]} or create a BAG project instead.`
                : `BAG projects must use the ${exports.ADAPTER_LABELS[exports.SCRAPER_ADAPTERS.BAG_AUCTION]} adapter.`,
        };
    }
    return { ok: true, adapter };
}
