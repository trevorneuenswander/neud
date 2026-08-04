"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCAL_CONTROLLER_WAITING_STATUS = void 0;
exports.resolveLocalControllerDisplayData = resolveLocalControllerDisplayData;
const lot_photo_overrides_1 = require("../bag/live-state/lot-photo-overrides");
const reserve_status_1 = require("../bag/reserve-status");
const display_utils_1 = require("./display-utils");
const display_bid_normalization_1 = require("./display-bid-normalization");
exports.LOCAL_CONTROLLER_WAITING_STATUS = "waiting-for-manual-input";
function normalizeLotNumber(value) {
    if (!value)
        return "";
    return value.replace(/^lot\s+/i, "").trim();
}
function readDatasetLots(dataset) {
    if (!dataset)
        return [];
    if (Array.isArray(dataset.lots)) {
        return dataset.lots.filter((entry) => Boolean(entry) && typeof entry === "object");
    }
    return [];
}
function findDatasetLot(dataset, lotNumber) {
    const normalized = normalizeLotNumber(lotNumber);
    if (!normalized)
        return null;
    for (const lot of readDatasetLots(dataset)) {
        const candidate = normalizeLotNumber(lot.lotNumber ?? lot.lot);
        if (candidate && candidate === normalized) {
            return lot;
        }
    }
    return null;
}
function readPhotoUrl(value) {
    if (typeof value === "string")
        return value;
    if (value.displayUrl)
        return value.displayUrl;
    if (value.sourceUrl)
        return value.sourceUrl;
    return null;
}
function mergePhotoUrls(lot, datasetLot) {
    const ordered = [];
    const seen = new Set();
    const add = (value) => {
        if (!value)
            return;
        const resolved = typeof value === "string" ? value : readPhotoUrl(value);
        if (!resolved || !(0, display_utils_1.isUsablePhotoUrl)(resolved) || seen.has(resolved))
            return;
        seen.add(resolved);
        ordered.push(resolved);
    };
    if (Array.isArray(lot.photos)) {
        for (const photo of lot.photos)
            add(photo);
    }
    add(lot.imageUrl);
    if (datasetLot) {
        if (Array.isArray(datasetLot.photos)) {
            for (const photo of datasetLot.photos)
                add(photo);
        }
        if (Array.isArray(datasetLot.photoUrls)) {
            for (const photo of datasetLot.photoUrls)
                add(photo);
        }
        add(datasetLot.imageUrl);
    }
    return (0, display_utils_1.filterUsablePhotoUrls)(ordered);
}
function readCurrencyStrings(submitted) {
    const fromDisplay = submitted?.auctionDisplay?.currencies;
    if (Array.isArray(fromDisplay)) {
        return fromDisplay.filter((entry) => typeof entry === "string");
    }
    return [];
}
function hasSubmittedLotContent(lot) {
    if (!lot)
        return false;
    return Boolean(lot.lotNumber?.trim() ||
        lot.title?.trim() ||
        lot.currentBidLabel?.trim() ||
        (lot.currentBid != null && lot.currentBid > 0));
}
function resolveLocalControllerDisplayData(input) {
    const submittedLot = input.submitted?.currentLot ?? null;
    if (!hasSubmittedLotContent(submittedLot)) {
        return null;
    }
    const datasetLot = findDatasetLot(input.dataset ?? null, submittedLot?.lotNumber ?? "");
    const mergedPhotos = mergePhotoUrls(submittedLot ?? {}, datasetLot);
    const photos = (0, lot_photo_overrides_1.applyLotPhotoOverrides)(mergedPhotos.map((url) => ({ url })), input.photoOverrides, submittedLot?.lotNumber ?? "").map((entry) => entry.url);
    const canonicalBidAmount = (0, display_bid_normalization_1.resolveCanonicalBidAmount)({
        currentBid: submittedLot?.currentBid,
        currentBidLabel: submittedLot?.currentBidLabel,
        biddingPrice: typeof input.submitted?.auctionDisplay?.biddingPrice === "string"
            ? input.submitted.auctionDisplay.biddingPrice
            : undefined,
    });
    const biddingPrice = (0, display_bid_normalization_1.normalizeDisplayBid)(submittedLot?.currentBidLabel ??
        submittedLot?.currentBid ??
        input.submitted?.auctionDisplay?.biddingPrice ??
        "");
    const currencies = (0, display_bid_normalization_1.hasCanonicalBid)(canonicalBidAmount)
        ? readCurrencyStrings(input.submitted)
        : [];
    const lotReserveStatus = (0, reserve_status_1.resolveStoredReserveStatusLabel)(submittedLot?.reserveStatus, datasetLot);
    const displayReserveStatus = (0, reserve_status_1.getVisibleReserveLabel)((0, reserve_status_1.normalizeReserveStatus)(submittedLot?.reserveStatus) !== "unknown"
        ? (0, reserve_status_1.normalizeReserveStatus)(submittedLot?.reserveStatus)
        : (0, reserve_status_1.readReserveStatusFromRecord)(datasetLot)) ?? "";
    const currentLot = {
        lotNumber: submittedLot?.lotNumber ?? "",
        title: submittedLot?.title ?? "",
        year: submittedLot?.year ?? datasetLot?.year ?? "",
        reserveStatus: lotReserveStatus,
        currentBid: canonicalBidAmount ?? undefined,
        currentBidLabel: biddingPrice === "—" ? "" : biddingPrice,
        imageUrl: photos[0] ?? submittedLot?.imageUrl,
        photos,
    };
    return {
        currentLot,
        nextLots: input.submitted?.nextLots ?? [],
        auctionDisplay: {
            lot: currentLot.lotNumber
                ? currentLot.lotNumber.trim().startsWith("Lot")
                    ? currentLot.lotNumber.trim()
                    : `Lot ${currentLot.lotNumber.trim()}`
                : "Lot —",
            title: currentLot.title ?? "",
            year: currentLot.year ?? "",
            reserveStatus: displayReserveStatus,
            biddingPrice,
            currencies,
            photos,
        },
    };
}
