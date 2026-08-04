"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptyManualLotNavigation = createEmptyManualLotNavigation;
exports.deriveCursorLotIdFromDraft = deriveCursorLotIdFromDraft;
exports.findLotByNavigationIdentity = findLotByNavigationIdentity;
exports.resolveNavigationStartingLot = resolveNavigationStartingLot;
exports.buildNavigationCapabilities = buildNavigationCapabilities;
exports.selectAdjacentLot = selectAdjacentLot;
exports.lotsDiffer = lotsDiffer;
exports.normalizeDownloadedLots = normalizeDownloadedLots;
exports.orderedLotsFromDataset = orderedLotsFromDataset;
const reserve_status_1 = require("../reserve-status");
const lot_number_sort_1 = require("../lot-number-sort");
const bag_lot_navigation_1 = require("./bag-lot-navigation");
function createEmptyManualLotNavigation() {
    return { cursorLotId: null };
}
function deriveCursorLotIdFromDraft(draft, lots) {
    if (!draft.lotNumber.trim())
        return null;
    const lot = (0, bag_lot_navigation_1.findLotByIdentifier)(lots, draft.lotNumber);
    return lot ? (0, bag_lot_navigation_1.lotIdentity)(lot) : null;
}
function findLotByNavigationIdentity(lots, identity) {
    return lots.find((lot) => (0, bag_lot_navigation_1.lotIdentity)(lot) === identity) ?? null;
}
function resolveNavigationStartingLot(input) {
    const { draft, navigation, submittedLot, datasetCurrentLot, lots } = input;
    if (lots.length === 0)
        return null;
    if (draft.lotDirty && draft.lotNumber.trim()) {
        const fromDraft = (0, bag_lot_navigation_1.findLotByIdentifier)(lots, draft.lotNumber);
        if (fromDraft)
            return fromDraft;
    }
    if (navigation.cursorLotId) {
        const fromCursor = findLotByNavigationIdentity(lots, navigation.cursorLotId);
        if (fromCursor)
            return fromCursor;
    }
    if (submittedLot) {
        const submittedIndex = (0, bag_lot_navigation_1.findLotIndex)(lots, submittedLot);
        if (submittedIndex >= 0)
            return lots[submittedIndex] ?? null;
    }
    if (datasetCurrentLot) {
        const datasetIndex = (0, bag_lot_navigation_1.findLotIndex)(lots, datasetCurrentLot);
        if (datasetIndex >= 0)
            return lots[datasetIndex] ?? null;
    }
    return lots[0] ?? null;
}
function buildNavigationCapabilities(lots, startingLot) {
    const index = (0, bag_lot_navigation_1.findLotIndex)(lots, startingLot);
    return {
        cursorLotId: startingLot ? (0, bag_lot_navigation_1.lotIdentity)(startingLot) : null,
        canSelectPrevious: index > 0,
        canSelectNext: index >= 0 && index < lots.length - 1,
    };
}
function selectAdjacentLot(lots, startingLot, direction) {
    const index = (0, bag_lot_navigation_1.findLotIndex)(lots, startingLot);
    if (index < 0)
        return null;
    const targetIndex = direction === "previous" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= lots.length)
        return null;
    return lots[targetIndex] ?? null;
}
function lotsDiffer(left, right) {
    if (!left || !right)
        return Boolean(left) !== Boolean(right);
    return (0, bag_lot_navigation_1.lotIdentity)(left) !== (0, bag_lot_navigation_1.lotIdentity)(right);
}
function normalizeDownloadedLots(dataset) {
    if (!dataset || !Array.isArray(dataset.lots) || dataset.lots.length === 0) {
        return [];
    }
    const lots = [];
    const seen = new Set();
    for (const entry of dataset.lots) {
        if (!entry || typeof entry !== "object")
            continue;
        const raw = entry;
        const lotNumber = typeof raw.lotNumber === "string"
            ? raw.lotNumber
            : typeof raw.lot === "string"
                ? raw.lot
                : "";
        const normalizedLotNumber = lotNumber.replace(/^lot\s+/i, "").trim();
        if (!normalizedLotNumber)
            continue;
        const id = typeof raw.id === "string" ? raw.id : undefined;
        const identity = id ? `id:${id}` : `lot:${normalizedLotNumber.toLowerCase()}`;
        if (seen.has(identity))
            continue;
        seen.add(identity);
        const normalizedReserve = (0, reserve_status_1.readReserveStatusFromRecord)(raw);
        const reserveStatus = normalizedReserve !== "unknown"
            ? (0, reserve_status_1.formatReserveStatusLabel)(normalizedReserve)
            : typeof raw.reserveStatus === "string"
                ? raw.reserveStatus
                : undefined;
        lots.push({
            id,
            lotNumber: normalizedLotNumber,
            title: typeof raw.title === "string" ? raw.title : undefined,
            year: typeof raw.year === "string" ? raw.year : undefined,
            reserveStatus,
            imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : undefined,
            currentBid: typeof raw.currentBid === "number" ? raw.currentBid : undefined,
            currentBidLabel: typeof raw.currentBidLabel === "string" ? raw.currentBidLabel : undefined,
            currency: typeof raw.currency === "string" ? raw.currency : undefined,
        });
    }
    return lots.sort((left, right) => (0, lot_number_sort_1.compareLotNumbers)(left.lotNumber ?? "", right.lotNumber ?? ""));
}
function orderedLotsFromDataset(automaticLots, dataset, preferDatasetOnly = false) {
    const downloadedLots = normalizeDownloadedLots(dataset);
    if (downloadedLots.length > 0 && preferDatasetOnly) {
        return downloadedLots;
    }
    if (!dataset || !Array.isArray(dataset.lots) || dataset.lots.length === 0) {
        return automaticLots;
    }
    const byIdentity = new Map();
    for (const lot of automaticLots) {
        const identity = (0, bag_lot_navigation_1.lotIdentity)(lot);
        if (identity)
            byIdentity.set(identity, lot);
    }
    const ordered = [];
    const seen = new Set();
    for (const entry of dataset.lots) {
        if (!entry || typeof entry !== "object")
            continue;
        const raw = entry;
        const lotNumber = typeof raw.lotNumber === "string"
            ? raw.lotNumber
            : typeof raw.lot === "string"
                ? raw.lot
                : "";
        const id = typeof raw.id === "string" ? raw.id : undefined;
        let matched = null;
        if (id) {
            matched = byIdentity.get(`id:${id}`) ?? null;
        }
        if (!matched && lotNumber) {
            matched = (0, bag_lot_navigation_1.findLotByIdentifier)(automaticLots, lotNumber);
        }
        const normalizedReserve = (0, reserve_status_1.readReserveStatusFromRecord)(raw);
        const reserveStatus = normalizedReserve !== "unknown"
            ? (0, reserve_status_1.formatReserveStatusLabel)(normalizedReserve)
            : matched?.reserveStatus;
        const lot = matched
            ? {
                ...matched,
                ...(reserveStatus ? { reserveStatus } : {}),
            }
            : {
                id,
                lotNumber: lotNumber.replace(/^lot\s+/i, "").trim() || lotNumber,
                title: typeof raw.title === "string" ? raw.title : undefined,
                year: typeof raw.year === "string" ? raw.year : undefined,
                ...(reserveStatus ? { reserveStatus } : {}),
                imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : undefined,
            };
        const identity = (0, bag_lot_navigation_1.lotIdentity)(lot);
        if (!identity || seen.has(identity))
            continue;
        seen.add(identity);
        ordered.push(lot);
    }
    return ordered.length > 0 ? ordered : downloadedLots.length > 0 ? downloadedLots : automaticLots;
}
