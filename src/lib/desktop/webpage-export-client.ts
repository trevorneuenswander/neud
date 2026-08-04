"use client";

import { getDesktopAPI } from "@/lib/desktop/client";
import type { OfflineExportProgress } from "@/lib/desktop/offline-auction-types";
import type {
  StartWebpageExportResponse,
  WebpageExportOperation,
  WebpageExportProgressEvent,
} from "@/lib/desktop/webpage-export-types";
import { isActiveWebpageExportStatus } from "@/lib/desktop/webpage-export-types";

type WebpageExportListener = (operations: WebpageExportOperation[]) => void;

let operations = new Map<string, WebpageExportOperation>();
let listeners = new Set<WebpageExportListener>();
let progressTeardown: (() => void) | null = null;
let subscriptionCount = 0;

function notifyListeners() {
  const snapshot = [...operations.values()].sort((left, right) =>
    right.startedAt.localeCompare(left.startedAt),
  );
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function upsertOperation(operation: WebpageExportOperation) {
  operations.set(operation.operationId, operation);
  notifyListeners();
}

function mapProgressEvent(event: WebpageExportProgressEvent): WebpageExportOperation {
  const existing = operations.get(event.operationId);
  return {
    operationId: event.operationId,
    projectId: event.projectId,
    projectSlug: existing?.projectSlug ?? event.projectSlug,
    requestId: existing?.requestId,
    workerId: existing?.workerId,
    generation: existing?.generation,
    status: event.status,
    phase: event.phase,
    percent: event.percent,
    message: event.message,
    completedLots: event.completed,
    totalLots: event.total,
    completedUnits: event.completedUnits ?? existing?.completedUnits ?? 0,
    totalUnits: event.totalUnits ?? existing?.totalUnits ?? 0,
    currentLotNumber: event.currentLotNumber ?? existing?.currentLotNumber,
    currentPhotoIndex: event.currentPhotoIndex ?? existing?.currentPhotoIndex,
    currentPhotoTotal: event.currentPhotoTotal ?? existing?.currentPhotoTotal,
    outputPath: event.outputPath,
    startedAt:
      operations.get(event.operationId)?.startedAt ?? new Date().toISOString(),
    finishedAt:
      event.status === "completed" ||
      event.status === "completed-with-warnings" ||
      event.status === "failed" ||
      event.status === "cancelled"
        ? new Date().toISOString()
        : operations.get(event.operationId)?.finishedAt,
    workerAcceptedAt: existing?.workerAcceptedAt,
    lastWorkerEventAt:
      event.status === "running" || event.status === "preparing" || event.status === "cancelling"
        ? new Date().toISOString()
        : existing?.lastWorkerEventAt,
    error: event.error,
    dismissAfter:
      event.status === "completed" || event.status === "cancelled"
        ? (existing?.dismissAfter ?? new Date(Date.now() + 5000).toISOString())
        : existing?.dismissAfter,
    presentationDismissedAt: existing?.presentationDismissedAt,
  };
}

function ensureProgressSubscription() {
  subscriptionCount += 1;
  if (progressTeardown) {
    return;
  }

  const api = getDesktopAPI()?.offlineAuction;
  if (!api) {
    return;
  }

  void api.listExportOperations?.().then((initial) => {
    operations = new Map(initial.map((operation) => [operation.operationId, operation]));
    notifyListeners();
  });

  progressTeardown = api.onProgress((event) => {
    if (!("projectId" in event) || !("operationId" in event) || !("status" in event)) {
      return;
    }
    upsertOperation(mapProgressEvent(event as WebpageExportProgressEvent));
  });
}

function releaseProgressSubscription() {
  subscriptionCount -= 1;
  if (subscriptionCount > 0 || !progressTeardown) {
    return;
  }
  progressTeardown();
  progressTeardown = null;
}

export function subscribeToWebpageExportOperations(
  listener: WebpageExportListener,
): () => void {
  listeners.add(listener);
  ensureProgressSubscription();
  listener([...operations.values()].sort((left, right) =>
    right.startedAt.localeCompare(left.startedAt),
  ));

  return () => {
    listeners.delete(listener);
    releaseProgressSubscription();
  };
}

export async function getWebpageExportOperation(
  projectId: string,
): Promise<WebpageExportOperation | null> {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api?.getExportOperation) {
    const local = [...operations.values()]
      .filter((operation) => operation.projectId === projectId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
    return local[0] ?? null;
  }
  return api.getExportOperation(projectId);
}

export async function listWebpageExportOperations(): Promise<WebpageExportOperation[]> {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api?.listExportOperations) {
    return [...operations.values()].sort((left, right) =>
      right.startedAt.localeCompare(left.startedAt),
    );
  }
  return api.listExportOperations();
}

export async function startWebpageExport(
  projectId: string,
): Promise<StartWebpageExportResponse> {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api) {
    return { ok: false, error: "Offline auction export is unavailable." };
  }
  return api.export(projectId) as Promise<StartWebpageExportResponse>;
}

export async function dismissCurrentWebpageExportOperation(
  projectId: string,
  operationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api?.dismissExportOperation) {
    return { ok: false, error: "Download dismissal is unavailable." };
  }
  const result = await api.dismissExportOperation({ projectId, operationId });
  if (result.ok) {
    operations.delete(operationId);
    notifyListeners();
  }
  return result;
}

export async function cancelCurrentWebpageDownload(
  operationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const api = getDesktopAPI()?.offlineAuction;
  if (!api?.cancelExport) {
    return { ok: false, error: "Download cancellation is unavailable." };
  }
  return api.cancelExport(operationId);
}

export async function isWebpageExportInProgress(projectId: string): Promise<boolean> {
  const api = getDesktopAPI()?.offlineAuction;
  if (api?.isExportInProgress) {
    return api.isExportInProgress(projectId);
  }
  const operation = await getWebpageExportOperation(projectId);
  return operation ? isActiveWebpageExportStatus(operation.status) : false;
}

export function operationToExportProgress(
  operation: WebpageExportOperation,
): OfflineExportProgress {
  return {
    exportId: operation.operationId,
    phase: operation.phase,
    percent: operation.percent,
    message: operation.message,
    completed: operation.completedLots,
    total: operation.totalLots,
    outputPath: operation.outputPath,
    error: operation.error,
  };
}

export function getActiveWebpageExportOperation(
  projectId?: string,
): WebpageExportOperation | null {
  const sorted = [...operations.values()].sort((left, right) =>
    right.startedAt.localeCompare(left.startedAt),
  );
  if (projectId) {
    return sorted.find((operation) => operation.projectId === projectId) ?? null;
  }
  return sorted.find((operation) => isActiveWebpageExportStatus(operation.status)) ?? null;
}
