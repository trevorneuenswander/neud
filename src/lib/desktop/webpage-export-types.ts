import type { OfflineExportProgress } from "@/lib/desktop/offline-auction-types";

export type WebpageExportOperationStatus =
  | "queued"
  | "preparing"
  | "running"
  | "cancelling"
  | "completed"
  | "completed-with-warnings"
  | "failed"
  | "cancelled";

export type WebpageExportOperation = {
  operationId: string;
  projectId: string;
  projectSlug?: string;
  requestId?: string;
  workerId?: string;
  generation?: number;
  status: WebpageExportOperationStatus;
  phase: OfflineExportProgress["phase"];
  percent: number;
  message: string;
  completedLots: number;
  totalLots: number;
  completedUnits?: number;
  totalUnits?: number;
  currentLotNumber?: string;
  currentPhotoIndex?: number;
  currentPhotoTotal?: number;
  outputPath?: string;
  startedAt: string;
  finishedAt?: string;
  workerAcceptedAt?: string;
  lastWorkerEventAt?: string;
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

export type StartWebpageExportResponse =
  | { ok: true; operationId: string; alreadyRunning?: boolean }
  | { ok: false; error: string };

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

export function getWebpageExportProgressTitle(
  operation: Pick<WebpageExportOperation, "status" | "phase">,
): string {
  if (operation.status === "cancelling") {
    return "Cancelling Current Webpage download…";
  }
  if (isActiveWebpageExportStatus(operation.status)) {
    return "Downloading Current Webpage";
  }
  if (operation.status === "completed-with-warnings") {
    return "Download Complete with Warnings";
  }
  if (operation.status === "completed") {
    return "Download Complete";
  }
  if (operation.status === "failed") {
    return "Download Failed";
  }
  if (operation.status === "cancelled") {
    return "Download cancelled";
  }
  if (operation.phase === "error") {
    return "Download Failed";
  }
  if (operation.phase === "complete") {
    return "Download Complete";
  }
  return "Downloading Current Webpage";
}
