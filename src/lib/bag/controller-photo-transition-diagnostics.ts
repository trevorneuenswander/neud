export type PhotoTransitionDiagnosticSnapshot = {
  targetLot: string;
  oldPhotoCount: number;
  newPhotoCount: number;
  photoPanelHeightBefore: number;
  photoPanelHeightDuring: number;
  photoPanelHeightAfter: number;
  scrollHeightBefore: number;
  scrollHeightDuring: number;
  scrollHeightAfter: number;
  scrollTopBefore: number;
  scrollTopDuring: number;
  scrollTopAfter: number;
  scrollbarPresentBefore: boolean;
  scrollbarPresentDuring: boolean;
  scrollbarPresentAfter: boolean;
  firstNewImageReadyAt: string | null;
  photoSwapAt: string | null;
};

const DEBUG_FLAG = "NEUD_DEBUG_CONTROLLER_PHOTOS";

export function isControllerPhotoTransitionDebugEnabled(): boolean {
  if (typeof process !== "undefined" && process.env?.[DEBUG_FLAG] === "1") {
    return true;
  }
  if (typeof window !== "undefined") {
    try {
      return window.localStorage.getItem(DEBUG_FLAG) === "1";
    } catch {
      return false;
    }
  }
  return false;
}

export function logPhotoTransitionDiagnostics(snapshot: PhotoTransitionDiagnosticSnapshot): void {
  if (!isControllerPhotoTransitionDebugEnabled()) {
    return;
  }
  console.debug("[NEUD Controller Photos]", snapshot);
}
