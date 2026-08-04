import type { OfflineExportProgress } from "./offline-auction-types";

export type WebpageExportOperationStatus =
  | "queued"
  | "preparing"
  | "running"
  | "cancelling"
  | "completed"
  | "completed-with-warnings"
  | "failed"
  | "cancelled";

export type WebpageExportTerminalEventSource =
  | "worker"
  | "worker-exit"
  | "shutdown"
  | "startup"
  | "renderer";

export type WebpageExportOperation = {
  operationId: string;
  projectId: string;
  projectSlug?: string;
  requestId?: string;
  workerId?: string;
  generation: number;
  status: WebpageExportOperationStatus;
  phase: OfflineExportProgress["phase"];
  percent: number;
  message: string;
  completedLots: number;
  totalLots: number;
  completedUnits: number;
  totalUnits: number;
  currentLotNumber?: string;
  currentPhotoIndex?: number;
  currentPhotoTotal?: number;
  outputPath?: string;
  startedAt: string;
  finishedAt?: string;
  workerAcceptedAt?: string;
  lastWorkerEventAt?: string;
  terminalEventSource?: WebpageExportTerminalEventSource;
  error?: string;
  dismissAfter?: string;
  presentationDismissedAt?: string;
};

export type WebpageExportProgressEvent = OfflineExportProgress & {
  projectId: string;
  projectSlug?: string;
  operationId: string;
  status: WebpageExportOperationStatus;
  completedUnits?: number;
  totalUnits?: number;
  currentLotNumber?: string;
  currentPhotoIndex?: number;
  currentPhotoTotal?: number;
};

export function isActiveWebpageExportStatus(
  status: WebpageExportOperationStatus,
): boolean {
  return (
    status === "queued" ||
    status === "preparing" ||
    status === "running" ||
    status === "cancelling"
  );
}

export function operationToProgressEvent(
  operation: WebpageExportOperation,
): WebpageExportProgressEvent {
  return {
    exportId: operation.operationId,
    operationId: operation.operationId,
    projectId: operation.projectId,
    projectSlug: operation.projectSlug,
    status: operation.status,
    phase: operation.phase,
    percent: operation.percent,
    message: operation.message,
    completed: operation.completedLots,
    total: operation.totalLots,
    completedUnits: operation.completedUnits,
    totalUnits: operation.totalUnits,
    currentLotNumber: operation.currentLotNumber,
    currentPhotoIndex: operation.currentPhotoIndex,
    currentPhotoTotal: operation.currentPhotoTotal,
    outputPath: operation.outputPath,
    error: operation.error,
  };
}
