export type ExportWorkerEventType =
  | "comprehensive-export-started"
  | "comprehensive-export-progress"
  | "comprehensive-export-complete"
  | "comprehensive-export-failed"
  | "comprehensive-export-cancelled";

export type ExportWorkerProgressPayload = {
  type: ExportWorkerEventType;
  operationId: string;
  requestId: string;
  projectId?: string;
  workerId?: string;
  generation?: number;
  phase?: string;
  message?: string;
  progressPhase?: "metadata" | "photos" | "writing";
  completedMetadataLots?: number;
  totalPhotos?: number;
  completedPhotos?: number;
  completedLots?: number;
  totalLots?: number;
  completedUnits?: number;
  totalUnits?: number;
  currentLotNumber?: string;
  currentPhotoIndex?: number;
  currentPhotoTotal?: number;
  percent?: number;
  photoCountDiscovered?: number;
  completeUnit?: boolean;
  completeUnits?: number;
  error?: string;
  result?: Record<string, unknown>;
};

export const EXPORT_STARTUP_TIMEOUT_MS = 120_000;
export const EXPORT_INACTIVITY_TIMEOUT_MS = 900_000;

export const EXPORT_SESSION_TIMEOUT_MESSAGE =
  "The Webpage Scraper started, but its authenticated auction session did not become ready. Check the Execution Log and try again.";
