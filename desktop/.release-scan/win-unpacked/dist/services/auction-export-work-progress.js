"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuctionExportWorkProgress = createAuctionExportWorkProgress;
exports.advanceAuctionExportWorkProgress = advanceAuctionExportWorkProgress;
const STARTUP_PHASES = [
    { phase: "preparing", percent: 0 },
    { phase: "loading-scraper-data", percent: 2 },
    { phase: "connecting-worker", percent: 6 },
    { phase: "preparing-export-page", percent: 8 },
];
function createAuctionExportWorkProgress(totalLots) {
    return {
        phase: "preparing",
        displayedPercent: 0,
        totalLots: Math.max(0, totalLots),
        completedMetadataLots: 0,
        totalPhotos: 0,
        completedPhotos: 0,
        message: "Preparing export…",
    };
}
function metadataPercent(completedLots, totalLots) {
    if (totalLots <= 0)
        return 10;
    return 10 + Math.floor((completedLots / totalLots) * 25);
}
function photoPercent(completedPhotos, totalPhotos) {
    if (totalPhotos <= 0)
        return 95;
    return 35 + Math.floor((completedPhotos / totalPhotos) * 60);
}
function clampActivePercent(percent) {
    return Math.max(0, Math.min(96, percent));
}
function advanceAuctionExportWorkProgress(state, input) {
    const next = {
        ...state,
        phase: input.phase ?? state.phase,
        totalLots: input.totalLots ?? state.totalLots,
        completedMetadataLots: input.completedMetadataLots ?? state.completedMetadataLots,
        totalPhotos: input.totalPhotos ?? state.totalPhotos,
        completedPhotos: input.completedPhotos ?? state.completedPhotos,
        currentLotNumber: input.currentLotNumber !== undefined ? input.currentLotNumber : state.currentLotNumber,
        currentPhotoIndex: input.currentPhotoIndex !== undefined ? input.currentPhotoIndex : state.currentPhotoIndex,
        message: input.message ?? state.message,
    };
    let calculatedPercent = state.displayedPercent;
    if (input.terminal === "complete") {
        calculatedPercent = 100;
        next.phase = "complete";
    }
    else if (input.terminal === "error") {
        next.phase = "error";
    }
    else if (typeof input.forcePercent === "number") {
        calculatedPercent = input.forcePercent;
    }
    else {
        const startup = STARTUP_PHASES.find((entry) => entry.phase === next.phase);
        if (startup) {
            calculatedPercent = startup.percent;
        }
        else if (next.phase === "writing-package") {
            calculatedPercent = 96;
        }
        else if (next.phase === "metadata") {
            calculatedPercent = metadataPercent(next.completedMetadataLots, next.totalLots);
        }
        else if (next.phase === "photos") {
            calculatedPercent = photoPercent(next.completedPhotos, next.totalPhotos);
        }
    }
    next.displayedPercent = Math.max(state.displayedPercent, calculatedPercent);
    if (input.terminal !== "complete") {
        next.displayedPercent = clampActivePercent(next.displayedPercent);
    }
    return next;
}
