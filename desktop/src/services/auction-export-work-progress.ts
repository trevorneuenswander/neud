export type AuctionExportWorkPhase =
  | "preparing"
  | "loading-scraper-data"
  | "connecting-worker"
  | "preparing-export-page"
  | "metadata"
  | "photos"
  | "writing-package"
  | "complete"
  | "error"
  | "idle";

export type AuctionExportWorkProgressState = {
  phase: AuctionExportWorkPhase;
  displayedPercent: number;
  totalLots: number;
  completedMetadataLots: number;
  totalPhotos: number;
  completedPhotos: number;
  currentLotNumber?: string;
  currentPhotoIndex?: number;
  message: string;
};

export type AuctionExportWorkProgressInput = {
  phase?: AuctionExportWorkPhase;
  totalLots?: number;
  completedMetadataLots?: number;
  totalPhotos?: number;
  completedPhotos?: number;
  currentLotNumber?: string;
  currentPhotoIndex?: number;
  message?: string;
  forcePercent?: number;
  terminal?: "complete" | "error";
};

const STARTUP_PHASES: Array<{ phase: AuctionExportWorkPhase; percent: number }> = [
  { phase: "preparing", percent: 0 },
  { phase: "loading-scraper-data", percent: 2 },
  { phase: "connecting-worker", percent: 6 },
  { phase: "preparing-export-page", percent: 8 },
];

export function createAuctionExportWorkProgress(
  totalLots: number,
): AuctionExportWorkProgressState {
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

function metadataPercent(completedLots: number, totalLots: number): number {
  if (totalLots <= 0) return 10;
  return 10 + Math.floor((completedLots / totalLots) * 25);
}

function photoPercent(completedPhotos: number, totalPhotos: number): number {
  if (totalPhotos <= 0) return 95;
  return 35 + Math.floor((completedPhotos / totalPhotos) * 60);
}

function clampActivePercent(percent: number): number {
  return Math.max(0, Math.min(96, percent));
}

export function advanceAuctionExportWorkProgress(
  state: AuctionExportWorkProgressState,
  input: AuctionExportWorkProgressInput,
): AuctionExportWorkProgressState {
  const next: AuctionExportWorkProgressState = {
    ...state,
    phase: input.phase ?? state.phase,
    totalLots: input.totalLots ?? state.totalLots,
    completedMetadataLots: input.completedMetadataLots ?? state.completedMetadataLots,
    totalPhotos: input.totalPhotos ?? state.totalPhotos,
    completedPhotos: input.completedPhotos ?? state.completedPhotos,
    currentLotNumber:
      input.currentLotNumber !== undefined ? input.currentLotNumber : state.currentLotNumber,
    currentPhotoIndex:
      input.currentPhotoIndex !== undefined ? input.currentPhotoIndex : state.currentPhotoIndex,
    message: input.message ?? state.message,
  };

  let calculatedPercent = state.displayedPercent;

  if (input.terminal === "complete") {
    calculatedPercent = 100;
    next.phase = "complete";
  } else if (input.terminal === "error") {
    next.phase = "error";
  } else if (typeof input.forcePercent === "number") {
    calculatedPercent = input.forcePercent;
  } else {
    const startup = STARTUP_PHASES.find((entry) => entry.phase === next.phase);
    if (startup) {
      calculatedPercent = startup.percent;
    } else if (next.phase === "writing-package") {
      calculatedPercent = 96;
    } else if (next.phase === "metadata") {
      calculatedPercent = metadataPercent(next.completedMetadataLots, next.totalLots);
    } else if (next.phase === "photos") {
      calculatedPercent = photoPercent(next.completedPhotos, next.totalPhotos);
    }
  }

  next.displayedPercent = Math.max(state.displayedPercent, calculatedPercent);
  if (input.terminal !== "complete") {
    next.displayedPercent = clampActivePercent(next.displayedPercent);
  }

  return next;
}
