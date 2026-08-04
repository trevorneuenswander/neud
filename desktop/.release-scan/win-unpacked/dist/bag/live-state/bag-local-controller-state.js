"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptyDraft = createEmptyDraft;
exports.createDraftFromLot = createDraftFromLot;
exports.syncDraftFromScrapedLot = syncDraftFromScrapedLot;
exports.draftLotPatch = draftLotPatch;
exports.draftBidAmount = draftBidAmount;
const bag_manual_validation_1 = require("./bag-manual-validation");
function createEmptyDraft() {
    return {
        lotNumber: "",
        title: "",
        reserveStatus: "",
        currentBid: null,
        currentBidLabel: "",
        lotDirty: false,
        bidDirty: false,
    };
}
function createDraftFromLot(lot) {
    return {
        lotNumber: lot?.lotNumber ?? "",
        title: lot?.title ?? "",
        reserveStatus: lot?.reserveStatus ?? "",
        currentBid: null,
        currentBidLabel: "",
        lotDirty: false,
        bidDirty: false,
    };
}
function syncDraftFromScrapedLot(draft, _lot) {
    return draft;
}
function draftLotPatch(draft, patch) {
    return {
        ...draft,
        lotNumber: patch.lotNumber ?? draft.lotNumber,
        title: patch.title ?? draft.title,
        reserveStatus: patch.reserveStatus ?? draft.reserveStatus,
        lotDirty: true,
    };
}
function draftBidAmount(draft, amount, currency = "USD") {
    return {
        ...draft,
        currentBid: amount,
        currentBidLabel: (0, bag_manual_validation_1.formatBidLabel)(amount, currency),
        bidDirty: true,
    };
}
