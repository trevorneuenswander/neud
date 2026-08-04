"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuctionExportProgressTracker = createAuctionExportProgressTracker;
exports.createAuctionExportProgress = createAuctionExportProgress;
const auction_export_work_progress_1 = require("./auction-export-work-progress");
function createAuctionExportProgressTracker(totalLots) {
    let state = (0, auction_export_work_progress_1.createAuctionExportWorkProgress)(totalLots);
    return {
        get state() {
            return state;
        },
        advance(input) {
            state = (0, auction_export_work_progress_1.advanceAuctionExportWorkProgress)(state, input);
            return mapWorkStateToProgress("", state);
        },
        toProgress(exportId, error, outputPath) {
            return mapWorkStateToProgress(exportId, state, error, outputPath);
        },
    };
}
function mapPhaseToOfflinePhase(phase) {
    switch (phase) {
        case "preparing":
            return "preparing";
        case "loading-scraper-data":
            return "loading-scraper-data";
        case "connecting-worker":
        case "preparing-export-page":
            return "signing-in";
        case "metadata":
        case "photos":
            return "processing-lots";
        case "writing-package":
            return "writing-package";
        case "complete":
            return "complete";
        case "error":
            return "error";
        default:
            return "preparing";
    }
}
function mapWorkStateToProgress(exportId, state, error, outputPath) {
    return {
        exportId,
        phase: mapPhaseToOfflinePhase(state.phase),
        completed: state.completedMetadataLots,
        total: state.totalLots,
        percent: state.displayedPercent,
        message: state.message,
        outputPath,
        error,
    };
}
/** @deprecated Use createAuctionExportProgressTracker for live exports. */
function createAuctionExportProgress(exportId, input) {
    const tracker = createAuctionExportProgressTracker(input.total ?? 0);
    const phaseMap = {
        preparing: { phase: "preparing", message: input.message },
        "loading-scraper-data": { phase: "loading-scraper-data", message: input.message },
        "signing-in": { phase: "connecting-worker", message: input.message },
        "processing-lots": {
            phase: "metadata",
            completedMetadataLots: input.completed ?? 0,
            message: input.message,
        },
        "writing-package": { phase: "writing-package", message: input.message },
        complete: { terminal: "complete", message: input.message },
        error: { terminal: "error", message: input.message },
    };
    tracker.advance(phaseMap[input.phase] ?? { message: input.message });
    const progress = tracker.toProgress(exportId, input.error, input.outputPath);
    if (input.phase === "complete") {
        progress.percent = 100;
        progress.phase = "complete";
    }
    else if (input.phase === "error") {
        progress.phase = "error";
    }
    return progress;
}
