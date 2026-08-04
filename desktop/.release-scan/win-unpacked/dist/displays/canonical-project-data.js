"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeScraperSnapshot = normalizeScraperSnapshot;
exports.normalizeLocalControllerSnapshot = normalizeLocalControllerSnapshot;
exports.buildCanonicalProjectSnapshot = buildCanonicalProjectSnapshot;
exports.serializeCanonicalProjectSnapshot = serializeCanonicalProjectSnapshot;
exports.validateCanonicalProjectData = validateCanonicalProjectData;
exports.listCanonicalTopLevelKeys = listCanonicalTopLevelKeys;
const CANONICAL_TOP_LEVEL_KEYS = [
    "prev",
    "current",
    "next",
    "lots",
    "lastSold",
    "auctionDisplay",
    "updatedAt",
    "dataSource",
];
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizeLegacyLotRow(value) {
    if (!isRecord(value)) {
        return null;
    }
    return {
        lot: value.lot ?? null,
        title: value.title ?? null,
        price: value.price ?? null,
        status: value.status ?? null,
        editHref: value.editHref ?? value.editUrl ?? null,
    };
}
function normalizeLastSold(value) {
    if (!isRecord(value)) {
        return null;
    }
    return {
        lot: value.lot ?? null,
        title: value.title ?? null,
        price: value.price ?? null,
        editUrl: value.editUrl ?? value.editHref ?? null,
    };
}
function normalizeLegacyLotRows(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((entry) => normalizeLegacyLotRow(entry))
        .filter((entry) => entry !== null);
}
function mergeDefinedStrings(manualValue, fallbackValue) {
    if (typeof manualValue === "string" && manualValue.trim()) {
        return manualValue;
    }
    return typeof fallbackValue === "string" ? fallbackValue : null;
}
function buildLegacyRowFromLocalController(localLot, baseRow) {
    const price = localLot.currentBidLabel ??
        (localLot.currentBid != null ? String(localLot.currentBid) : null) ??
        (typeof baseRow?.price === "string" ? baseRow.price : null);
    return {
        lot: mergeDefinedStrings(localLot.lotNumber, baseRow?.lot),
        title: mergeDefinedStrings(localLot.title, baseRow?.title),
        price,
        status: mergeDefinedStrings(localLot.reserveStatus, baseRow?.status),
        editHref: baseRow?.editHref ?? baseRow?.editUrl ?? null,
    };
}
function mergeAuctionDisplay(base, local) {
    if (!base && !local) {
        return null;
    }
    return {
        ...(base ?? {}),
        ...(local ?? {}),
    };
}
function mergeNextLots(baseNext, localNext) {
    if (localNext && localNext.length > 0) {
        return localNext.map((entry) => ({
            lot: entry.lotNumber ?? "—",
            title: entry.title ?? entry.description ?? "",
            price: "",
            status: null,
            editHref: null,
        }));
    }
    return baseNext;
}
function normalizeScraperSnapshot(raw) {
    if (!raw) {
        return null;
    }
    return {
        prev: normalizeLegacyLotRow(raw.prev),
        current: normalizeLegacyLotRow(raw.current),
        next: normalizeLegacyLotRows(raw.next),
        lots: normalizeLegacyLotRows(raw.lots),
        lastSold: normalizeLastSold(raw.lastSold),
        auctionDisplay: isRecord(raw.auctionDisplay) ? raw.auctionDisplay : null,
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
        dataSource: "webpage-scraper",
    };
}
function normalizeLocalControllerSnapshot(input) {
    const base = input.scraperBase ?? {
        prev: null,
        current: null,
        next: [],
        lots: [],
        lastSold: null,
        auctionDisplay: null,
        updatedAt: new Date().toISOString(),
        dataSource: "local-controller",
    };
    if (!input.localControllerState?.currentLot) {
        return {
            prev: base.prev ?? null,
            current: base.current ?? null,
            next: base.next ?? [],
            lots: base.lots ?? [],
            lastSold: base.lastSold ?? null,
            auctionDisplay: base.auctionDisplay ?? null,
            updatedAt: new Date().toISOString(),
            dataSource: "local-controller",
        };
    }
    const localLot = input.localControllerState.currentLot;
    const current = buildLegacyRowFromLocalController(localLot, base.current ?? null);
    return {
        prev: base.prev ?? null,
        current,
        next: mergeNextLots(base.next ?? [], input.localControllerState.nextLots),
        lots: base.lots ?? [],
        lastSold: base.lastSold ?? null,
        auctionDisplay: mergeAuctionDisplay(base.auctionDisplay ?? null, input.localControllerState.auctionDisplay),
        updatedAt: new Date().toISOString(),
        dataSource: "local-controller",
    };
}
function buildCanonicalProjectSnapshot(input) {
    const scraperBase = normalizeScraperSnapshot(input.scraperSnapshot);
    if (input.source === "webpage-scraper") {
        return scraperBase;
    }
    return normalizeLocalControllerSnapshot({
        scraperBase,
        localControllerState: input.localControllerState,
    });
}
function serializeCanonicalProjectSnapshot(snapshot) {
    if (!snapshot) {
        return null;
    }
    return {
        prev: snapshot.prev ?? null,
        current: snapshot.current ?? null,
        next: snapshot.next ?? [],
        lots: snapshot.lots ?? [],
        lastSold: snapshot.lastSold ?? null,
        auctionDisplay: snapshot.auctionDisplay ?? null,
        updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
        dataSource: snapshot.dataSource,
    };
}
function validateCanonicalProjectData(value) {
    if (!isRecord(value)) {
        return { ok: false, issues: ["Canonical snapshot must be an object."] };
    }
    const issues = [];
    for (const key of Object.keys(value)) {
        if (!CANONICAL_TOP_LEVEL_KEYS.includes(key)) {
            issues.push(`Unexpected top-level key: ${key}`);
        }
    }
    for (const key of CANONICAL_TOP_LEVEL_KEYS) {
        if (!(key in value)) {
            issues.push(`Missing top-level key: ${key}`);
        }
    }
    if (!Array.isArray(value.next)) {
        issues.push("next must be an array.");
    }
    if (!Array.isArray(value.lots)) {
        issues.push("lots must be an array.");
    }
    if (value.dataSource !== "webpage-scraper" &&
        value.dataSource !== "local-controller") {
        issues.push("dataSource must be webpage-scraper or local-controller.");
    }
    if (issues.length > 0) {
        return { ok: false, issues };
    }
    return { ok: true, data: value };
}
function listCanonicalTopLevelKeys() {
    return CANONICAL_TOP_LEVEL_KEYS;
}
