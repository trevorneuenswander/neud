"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapLiveStateToLowerTickerFeed = mapLiveStateToLowerTickerFeed;
exports.mapSnapshotToLowerTickerFeed = mapSnapshotToLowerTickerFeed;
function asString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}
function normalizeLot(raw) {
    const lot = asString(raw.lot ?? raw.lotNumber, "").trim();
    const title = asString(raw.title ?? raw.desc ?? raw.description, "").trim();
    if (!lot && !title) {
        return null;
    }
    return {
        lot: lot || "—",
        title,
    };
}
function isTrustedNextArray(value) {
    return Array.isArray(value) && value.length > 0;
}
function deriveNextFromLots(snapshot) {
    const lots = Array.isArray(snapshot.lots)
        ? snapshot.lots
        : [];
    if (!lots.length) {
        return [];
    }
    let activeIndex = lots.findIndex((row) => row.status && /active/i.test(String(row.status)));
    if (activeIndex < 0 && snapshot.current && typeof snapshot.current === "object") {
        const currentLot = asString(snapshot.current.lot, "").trim();
        if (currentLot) {
            activeIndex = lots.findIndex((row) => asString(row.lot, "").trim() === currentLot);
        }
    }
    const sliceStart = activeIndex >= 0 ? activeIndex + 1 : 1;
    const sliceEnd = activeIndex >= 0 ? activeIndex + 4 : 4;
    return lots
        .slice(sliceStart, sliceEnd)
        .map((row) => normalizeLot(row))
        .filter((row) => row !== null)
        .slice(0, 3);
}
function mapLiveStateToLowerTickerFeed(state) {
    if (!state?.nextLots?.length) {
        return { next: [] };
    }
    return mapSnapshotToLowerTickerFeed({
        next: state.nextLots.map((lot) => ({
            lot: lot.lotNumber ?? "—",
            title: lot.title ?? lot.description ?? "",
        })),
    });
}
function mapSnapshotToLowerTickerFeed(snapshot) {
    if (!snapshot) {
        return { next: [] };
    }
    if (isTrustedNextArray(snapshot.next)) {
        const fromNext = snapshot.next
            .map((row) => normalizeLot(row))
            .filter((row) => row !== null)
            .slice(0, 3);
        if (fromNext.length > 0) {
            return { next: fromNext };
        }
    }
    return { next: deriveNextFromLots(snapshot) };
}
