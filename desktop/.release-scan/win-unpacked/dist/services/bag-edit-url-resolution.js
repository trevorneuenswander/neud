"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVehicleIdFromEditUrl = getVehicleIdFromEditUrl;
exports.isBlockedAuctionOrigin = isBlockedAuctionOrigin;
exports.resolveAuctionOriginFromUrl = resolveAuctionOriginFromUrl;
exports.resolveLotEditUrlForExport = resolveLotEditUrlForExport;
exports.resolveAuctionOriginForExport = resolveAuctionOriginForExport;
exports.buildEditUrlDiagnostics = buildEditUrlDiagnostics;
exports.formatComprehensiveExportFailureMessage = formatComprehensiveExportFailureMessage;
exports.resolveLotEditUrlFromLot = resolveLotEditUrlFromLot;
const default_sources_1 = require("../bag/default-sources");
function getVehicleIdFromEditUrl(value) {
    const match = String(value ?? "").match(/\/vehicles\/(\d+)\/edit(?:[?#].*)?$/i);
    return match?.[1] ?? null;
}
function isBlockedAuctionOrigin(urlString) {
    try {
        const parsed = new URL(urlString);
        if (!["http:", "https:"].includes(parsed.protocol)) {
            return true;
        }
        const host = parsed.hostname.toLowerCase();
        return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
    }
    catch {
        return true;
    }
}
function resolveAuctionOriginFromUrl(auctionUrl) {
    if (!auctionUrl?.trim())
        return null;
    try {
        const parsed = new URL(auctionUrl.trim());
        if (isBlockedAuctionOrigin(parsed.toString())) {
            return null;
        }
        return `${parsed.protocol}//${parsed.host}`;
    }
    catch {
        return null;
    }
}
function resolveLotEditUrlForExport(href, auctionOrigin) {
    if (!href?.trim())
        return null;
    let absolute;
    try {
        absolute = new URL(href.trim(), `${auctionOrigin}/`).toString();
    }
    catch {
        return null;
    }
    if (isBlockedAuctionOrigin(absolute)) {
        return null;
    }
    let parsed;
    try {
        parsed = new URL(absolute);
    }
    catch {
        return null;
    }
    const vehicleMatch = parsed.pathname.match(/^\/vehicles\/(\d+)(?:\/edit)?\/?$/i);
    if (!vehicleMatch) {
        return null;
    }
    parsed.pathname = `/vehicles/${vehicleMatch[1]}/edit`;
    return parsed.toString();
}
function resolveAuctionOriginForExport(input) {
    const fromSnapshot = (typeof input.snapshot.sourceUrl === "string" && input.snapshot.sourceUrl) ||
        (typeof input.snapshot.listingUrl === "string" && input.snapshot.listingUrl) ||
        null;
    const snapshotOrigin = resolveAuctionOriginFromUrl(fromSnapshot);
    if (snapshotOrigin) {
        return snapshotOrigin;
    }
    if (input.engineId) {
        const vehiclesSource = input.dataSources.getSourceByKey(input.engineId, "vehicles");
        const engineOrigin = resolveAuctionOriginFromUrl(vehiclesSource?.url);
        if (engineOrigin) {
            return engineOrigin;
        }
    }
    return default_sources_1.BAG_AUCTION_SITE_ORIGIN;
}
function readLotNumber(lot) {
    const raw = lot.lotNumber ?? lot.lot ?? "";
    return raw.replace(/^lot\s+/i, "").trim();
}
function buildEditUrlDiagnostics(lots, auctionOrigin) {
    const sampleSourceEditUrls = [];
    const sampleResolvedEditUrls = [];
    let lotsWithSourceEditHref = 0;
    let lotsWithResolvedEditUrl = 0;
    for (const lot of lots) {
        const source = lot.editHref ?? lot.editUrl ?? lot.detailUrl ?? null;
        if (source) {
            lotsWithSourceEditHref += 1;
            if (sampleSourceEditUrls.length < 3) {
                sampleSourceEditUrls.push(source);
            }
        }
        const resolved = resolveLotEditUrlForExport(source, auctionOrigin);
        if (resolved) {
            lotsWithResolvedEditUrl += 1;
            lot.editUrl = resolved;
            if (!lot.editHref && source) {
                try {
                    lot.editHref = new URL(resolved).pathname;
                }
                catch {
                    lot.editHref = source;
                }
            }
            if (sampleResolvedEditUrls.length < 3) {
                sampleResolvedEditUrls.push(resolved);
            }
        }
        const vehicleId = getVehicleIdFromEditUrl(resolved ?? source);
        if (vehicleId) {
            lot.vehicleId = vehicleId;
        }
        if (!readLotNumber(lot)) {
            continue;
        }
    }
    return {
        lotsTotal: lots.length,
        lotsWithSourceEditHref,
        lotsWithResolvedEditUrl,
        sampleSourceEditUrls,
        sampleResolvedEditUrls,
    };
}
function formatComprehensiveExportFailureMessage(input) {
    const failures = input.diagnostics?.lotFailures ?? [];
    const first = failures[0];
    const appendFirstFailure = (message) => {
        if (!first || message.includes("First failure:")) {
            return message;
        }
        return `${message}\n\nFirst failure:\nLot ${first.lotNumber ?? first.lotId ?? "unknown"}\nURL: ${first.resolvedEditUrl ?? first.sourceEditUrl ?? "unknown"}\nStage: ${first.stage}\nReason: ${first.message}`;
    };
    if ((input.diagnostics?.detailNavigationsSucceeded ?? 0) === 0 &&
        failures.some((entry) => entry.stage === "url-resolution")) {
        return appendFirstFailure("Comprehensive export could not resolve any Lot Details URLs from the auction table snapshot.");
    }
    if ((input.diagnostics?.detailNavigationsSucceeded ?? 0) === 0 &&
        failures.some((entry) => entry.stage === "authentication" || entry.loginPageDetected)) {
        return appendFirstFailure("Lot Details pages redirected to sign-in.");
    }
    if ((input.diagnostics?.detailNavigationsSucceeded ?? 0) === 0) {
        return appendFirstFailure("Comprehensive export could not open any Lot Details pages.");
    }
    if ((input.diagnostics?.detailPagesParsed ?? 0) === 0 &&
        (input.diagnostics?.detailNavigationsSucceeded ?? 0) > 0) {
        return appendFirstFailure("Lot Details pages opened, but their fields could not be parsed.");
    }
    if ((input.diagnostics?.detailPagesParsed ?? 0) > 0 &&
        (input.diagnostics?.detailResultsMerged ?? 0) === 0) {
        return appendFirstFailure("Lot Details pages were parsed, but their results could not be matched to auction lots.");
    }
    return appendFirstFailure("Comprehensive export failed before any Lot Details pages completed successfully.");
}
function resolveLotEditUrlFromLot(lot, auctionOrigin) {
    const vehicleId = (typeof lot.vehicleId === "string" && lot.vehicleId.trim()) ||
        getVehicleIdFromEditUrl(lot.editUrl) ||
        getVehicleIdFromEditUrl(lot.editHref) ||
        getVehicleIdFromEditUrl(lot.detailUrl) ||
        null;
    const candidates = [
        lot.editUrl,
        lot.editHref,
        lot.detailUrl,
        vehicleId ? `/vehicles/${vehicleId}/edit` : null,
        vehicleId ? `${auctionOrigin}/vehicles/${vehicleId}/edit` : null,
    ];
    for (const candidate of candidates) {
        const resolved = resolveLotEditUrlForExport(candidate, auctionOrigin);
        if (resolved) {
            return {
                editUrl: resolved,
                vehicleId: getVehicleIdFromEditUrl(resolved) ?? vehicleId,
            };
        }
    }
    return { editUrl: null, vehicleId };
}
