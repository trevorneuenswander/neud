export type DisplaySyncUnavailableReason =
  | "auth_required"
  | "missing_authenticated_client"
  | "refresh_failed"
  | "invalid_refresh_token"
  | "network_unreachable"
  | "rpc_failed"
  | "cloud_session_unavailable"
  | "cloud_connection_unavailable"
  | "service_not_running"
  | "unknown";

export type DisplaySyncState =
  | { status: "synced"; message: string }
  | { status: "syncing"; message: string }
  | { status: "offline"; message: string }
  | { status: "error"; message: string }
  | { status: "idle"; message: string };

export type DisplaySyncPassResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  remainingEligible: number;
  remainingDelayedRetry: number;
};

export type DisplaySyncDiagnostics = {
  instanceId: string;
  online: boolean;
  pendingQueueCount: number;
  pendingDisplayCount: number;
  pendingTombstoneCount: number;
  pendingDisplayRows: number;
  pendingRevisionRows: number;
  failedDisplayRows: number;
  failedRevisionRows: number;
  oldestPendingAt: string | null;
  lastSyncError: string | null;
  lastDisplaySyncAttemptAt: string | null;
  lastDisplaySyncResult: string | null;
  lastCloudErrorCode: string | null;
  lastPassAttempted: number;
  lastPassSucceeded: number;
  lastPassFailed: number;
  lastPassSkipped: number;
  lastPassRemainingEligible: number;
  lastPassRemainingDelayedRetry: number;
  syncInProgress: boolean;
  running: boolean;
  cloudSessionAvailable: boolean;
  authenticatedCloudSessionAvailable: boolean;
  displaySyncServiceRunning: boolean;
  authenticated: boolean;
  lastUnavailableReason: DisplaySyncUnavailableReason | string | null;
};

export const DISPLAY_SYNC_LAST_ATTEMPT_KEY = "displaySync.lastAttemptAt";
export const DISPLAY_SYNC_LAST_RESULT_KEY = "displaySync.lastResult";
export const DISPLAY_SYNC_LAST_CLOUD_ERROR_KEY = "displaySync.lastCloudErrorCode";
export const DISPLAY_SYNC_LAST_PASS_RESULT_KEY = "displaySync.lastPassResult";

export function createEmptyDisplaySyncPassResult(): DisplaySyncPassResult {
  return {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    remainingEligible: 0,
    remainingDelayedRetry: 0,
  };
}

export const DISPLAY_SYNC_BACKOFF_MS = [5_000, 15_000, 45_000, 120_000] as const;
export const DISPLAY_SYNC_LAST_PUSH_KEY = "displaySync.lastSuccessfulPushAt";
export const DISPLAY_SYNC_LAST_PULL_KEY = "displaySync.lastSuccessfulPullAt";

export type DisplaySyncOperationType =
  | "display.create"
  | "display.update"
  | "display.archive"
  | "display.unarchive"
  | "display.delete"
  | "display.revision.create"
  | "display.active_revision.update"
  | "display.order.update";
