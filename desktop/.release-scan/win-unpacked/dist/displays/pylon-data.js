"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapSnapshotToPylonFeed = mapSnapshotToPylonFeed;
exports.mapLiveStateToPylonFeed = mapLiveStateToPylonFeed;
exports.sanitizePylonFeedPayload = sanitizePylonFeedPayload;
const display_utils_1 = require("./display-utils");
const display_currency_1 = require("./display-currency");
const display_bid_normalization_1 = require("./display-bid-normalization");
const EMPTY_AUCTION_DISPLAY = {
    lot: "Lot —",
    title: "",
    year: "",
    reserveStatus: "",
    biddingPrice: "",
    currencies: [],
    photos: [],
};
function asString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}
function asStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((entry) => typeof entry === "string");
}
function stripCredentials(value) {
    return value.replace(/\/\/[^/@]+@[^/]+\//g, "//");
}
function mapSnapshotToPylonFeed(snapshot, source = "webpage-scraper") {
    const raw = snapshot &&
        typeof snapshot.auctionDisplay === "object" &&
        snapshot.auctionDisplay !== null
        ? snapshot.auctionDisplay
        : null;
    if (!raw) {
        return { auctionDisplay: { ...EMPTY_AUCTION_DISPLAY } };
    }
    const photos = asStringArray(raw.photos)
        .map(stripCredentials)
        .filter(display_utils_1.isUsablePhotoUrl);
    const rawBid = raw.biddingPrice ??
        raw.currentBidLabel ??
        raw.currentBid;
    const biddingPrice = (0, display_bid_normalization_1.normalizeDisplayBid)(rawBid);
    const currencies = (0, display_bid_normalization_1.hasCanonicalBid)(rawBid)
        ? (0, display_currency_1.formatDisplayCurrencyRowsForPylon)(asStringArray(raw.currencies), source)
        : [];
    return {
        auctionDisplay: {
            lot: asString(raw.lot, "Lot —"),
            title: asString(raw.title),
            year: asString(raw.year),
            reserveStatus: asString(raw.reserveStatus),
            biddingPrice,
            currencies,
            photos,
        },
    };
}
function mapLiveStateToPylonFeed(state, source = "local-controller") {
    if (!state) {
        return { auctionDisplay: { ...EMPTY_AUCTION_DISPLAY } };
    }
    if (state.auctionDisplay && typeof state.auctionDisplay === "object") {
        return mapSnapshotToPylonFeed({ auctionDisplay: state.auctionDisplay }, source);
    }
    const lot = state.currentLot;
    if (!lot) {
        return { auctionDisplay: { ...EMPTY_AUCTION_DISPLAY } };
    }
    const lotLabel = lot.lotNumber?.trim()
        ? lot.lotNumber.trim().startsWith("Lot")
            ? lot.lotNumber.trim()
            : `Lot ${lot.lotNumber.trim()}`
        : "Lot —";
    const photos = asStringArray(lot.photos)
        .map(stripCredentials)
        .filter(display_utils_1.isUsablePhotoUrl);
    const resolvedPhotos = photos.length > 0
        ? photos
        : lot.imageUrl && (0, display_utils_1.isUsablePhotoUrl)(lot.imageUrl)
            ? [stripCredentials(lot.imageUrl)]
            : [];
    return mapSnapshotToPylonFeed({
        auctionDisplay: {
            lot: lotLabel,
            title: lot.title ?? "",
            year: lot.year ?? "",
            reserveStatus: lot.reserveStatus ?? "",
            biddingPrice: (0, display_bid_normalization_1.normalizeDisplayBid)(lot.currentBidLabel ?? lot.currentBid ?? ""),
            currencies: (0, display_bid_normalization_1.hasCanonicalBid)(lot.currentBidLabel ?? lot.currentBid)
                ? (0, display_currency_1.formatDisplayCurrencyRowsForPylon)(asStringArray(lot.currencies), source)
                : [],
            photos: resolvedPhotos,
        },
    }, source);
}
function sanitizePylonFeedPayload(payload) {
    const forbidden = JSON.stringify(payload);
    if (/"(password|credentials|email)"\s*:/i.test(forbidden)) {
        return { auctionDisplay: { ...EMPTY_AUCTION_DISPLAY } };
    }
    return payload;
}
