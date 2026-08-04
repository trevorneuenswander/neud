export type ActivitySyncStatus = "pending" | "syncing" | "synced" | "failed";

export type ActivitySyncCursor = {
  updatedAt: string;
  id: string;
};

export type ActivitySyncDiagnostics = {
  instanceId: string;
  cloudUserId: string | null;
  online: boolean;
  lastSuccessfulPushAt: string | null;
  lastSuccessfulPullAt: string | null;
  cursor: ActivitySyncCursor | null;
  pendingUploadCount: number;
  failedUploadCount: number;
  lastSyncError: string | null;
  cloudProvider: "supabase";
  lastPushUploaded: number;
  lastPullDownloaded: number;
  syncInProgress: boolean;
  emittedEventTypeCount: number;
  rejectedEventTypes: string[];
  localAllowedEventTypes: string[];
  allowlistMismatchCount: number;
  recoverableFailedCount: number;
  unrecoverableFailedCount: number;
  requeuedCount: number;
  duplicatePreventedCount: number;
  firstActivitySyncFailureStage:
    | "event_not_allowlisted"
    | "payload_invalid"
    | "actor_resolution_failed"
    | "cloud_rpc_failed"
    | "retry_not_scheduled"
    | "duplicate_conflict"
    | "none";
};

export type ActivitySyncState = {
  status: "synced" | "syncing" | "offline" | "error";
  message: string;
  diagnostics: ActivitySyncDiagnostics;
};

export const ACTIVITY_SYNC_CURSOR_KEY = "neud.activitySync.cursor";
export const ACTIVITY_SYNC_LAST_PUSH_KEY = "neud.activitySync.lastSuccessfulPushAt";
export const ACTIVITY_SYNC_LAST_PULL_KEY = "neud.activitySync.lastSuccessfulPullAt";

export const ACTIVITY_SYNC_BACKOFF_MS = [5_000, 15_000, 60_000, 300_000, 900_000] as const;
