export type ActivitySyncStatusLabel = "synced" | "syncing" | "offline" | "error";

export type ActivitySyncFailureStage =
  | "event_not_allowlisted"
  | "payload_invalid"
  | "actor_resolution_failed"
  | "cloud_rpc_failed"
  | "retry_not_scheduled"
  | "duplicate_conflict"
  | "none";

export type ActivitySyncDiagnostics = {
  instanceId: string;
  cloudUserId: string | null;
  online: boolean;
  lastSuccessfulPushAt: string | null;
  lastSuccessfulPullAt: string | null;
  cursor: { updatedAt: string; id: string } | null;
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
  firstActivitySyncFailureStage: ActivitySyncFailureStage;
};

export type ActivitySyncState = {
  status: ActivitySyncStatusLabel;
  message: string;
  diagnostics: ActivitySyncDiagnostics;
};
