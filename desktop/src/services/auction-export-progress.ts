import type { OfflineExportProgress } from "./offline-auction-types";
import {
  advanceAuctionExportWorkProgress,
  createAuctionExportWorkProgress,
  type AuctionExportWorkProgressInput,
  type AuctionExportWorkProgressState,
} from "./auction-export-work-progress";

export type AuctionExportPhase = OfflineExportProgress["phase"];

export type AuctionExportProgressTracker = {
  state: AuctionExportWorkProgressState;
  advance(input: AuctionExportWorkProgressInput): OfflineExportProgress;
  toProgress(exportId: string, error?: string, outputPath?: string): OfflineExportProgress;
};

export function createAuctionExportProgressTracker(
  totalLots: number,
): AuctionExportProgressTracker {
  let state = createAuctionExportWorkProgress(totalLots);

  return {
    get state() {
      return state;
    },
    advance(input: AuctionExportWorkProgressInput): OfflineExportProgress {
      state = advanceAuctionExportWorkProgress(state, input);
      return mapWorkStateToProgress("", state);
    },
    toProgress(exportId: string, error?: string, outputPath?: string): OfflineExportProgress {
      return mapWorkStateToProgress(exportId, state, error, outputPath);
    },
  };
}

function mapPhaseToOfflinePhase(
  phase: AuctionExportWorkProgressState["phase"],
): OfflineExportProgress["phase"] {
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

function mapWorkStateToProgress(
  exportId: string,
  state: AuctionExportWorkProgressState,
  error?: string,
  outputPath?: string,
): OfflineExportProgress {
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
export function createAuctionExportProgress(
  exportId: string,
  input: {
    phase: AuctionExportPhase;
    completed?: number;
    total?: number;
    message: string;
    outputPath?: string;
    error?: string;
  },
): OfflineExportProgress {
  const tracker = createAuctionExportProgressTracker(input.total ?? 0);
  const phaseMap: Record<string, AuctionExportWorkProgressInput> = {
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
  } else if (input.phase === "error") {
    progress.phase = "error";
  }
  return progress;
}
