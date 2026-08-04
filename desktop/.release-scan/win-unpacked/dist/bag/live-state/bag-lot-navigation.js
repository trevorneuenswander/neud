"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lotIdentity = lotIdentity;
exports.findLotIndex = findLotIndex;
exports.findLotByIdentifier = findLotByIdentifier;
exports.rebuildNavigation = rebuildNavigation;
exports.selectNextLot = selectNextLot;
exports.selectPreviousLot = selectPreviousLot;
exports.statesDifferForComparison = statesDifferForComparison;
function lotIdentity(lot) {
    if (!lot)
        return null;
    if (lot.id)
        return `id:${lot.id}`;
    if (lot.lotNumber)
        return `lot:${lot.lotNumber.trim().toLowerCase()}`;
    return null;
}
function findLotIndex(lots, lot) {
    const identity = lotIdentity(lot);
    if (!identity)
        return -1;
    return lots.findIndex((candidate) => lotIdentity(candidate) === identity);
}
function findLotByIdentifier(lots, identifier) {
    const trimmed = identifier.trim();
    if (!trimmed)
        return null;
    const byId = lots.find((lot) => lot.id === trimmed);
    if (byId)
        return byId;
    const normalized = trimmed.toLowerCase();
    return (lots.find((lot) => lot.lotNumber?.trim().toLowerCase() === normalized) ??
        lots.find((lot) => lot.lotNumber?.replace(/^lot\s+/i, "").toLowerCase() === normalized) ??
        null);
}
function rebuildNavigation(state, currentLot) {
    const lots = state.lots;
    const index = findLotIndex(lots, currentLot);
    return {
        ...state,
        currentLot,
        previousLot: index > 0 ? lots[index - 1] ?? null : null,
        nextLots: index >= 0 ? lots.slice(index + 1, index + 4) : lots.slice(0, 3),
    };
}
function selectNextLot(state) {
    if (state.lots.length === 0)
        return null;
    const index = findLotIndex(state.lots, state.currentLot);
    if (index < 0)
        return state.lots[0] ?? null;
    return state.lots[index + 1] ?? null;
}
function selectPreviousLot(state) {
    if (state.lots.length === 0)
        return null;
    const index = findLotIndex(state.lots, state.currentLot);
    if (index <= 0)
        return null;
    return state.lots[index - 1] ?? null;
}
function statesDifferForComparison(manual, automatic) {
    if (!automatic)
        return false;
    const manualLot = manual.currentLot;
    const autoLot = automatic.currentLot;
    if (!manualLot && !autoLot)
        return false;
    if (!manualLot || !autoLot)
        return true;
    return (lotIdentity(manualLot) !== lotIdentity(autoLot) ||
        manualLot.currentBid !== autoLot.currentBid ||
        manualLot.sold !== autoLot.sold ||
        manualLot.passed !== autoLot.passed);
}
