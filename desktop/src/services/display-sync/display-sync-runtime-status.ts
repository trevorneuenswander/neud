export const DISPLAY_SYNC_RUNTIME_STATUS_KEY = "displaySync.runtimeStatus";

export type DisplaySyncRuntimeStatus = {
  initialized: boolean;
  running: boolean;
  authenticatedSessionAvailable: boolean;
  publicCloudConfigAvailable: boolean;
  syncInProgress: boolean;
  pendingFollowUp: boolean;
  syncRequestedWhileUnavailable: boolean;
  lastStartAt: string | null;
  lastStopAt: string | null;
  lastSyncAttemptAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSyncResult: string | null;
  lastCloudErrorCode: string | null;
  lastUnavailableReason: string | null;
  pendingQueueCount: number;
  lastPassAttempted: number;
  lastPassSucceeded: number;
  lastPassFailed: number;
  lastPassSkipped: number;
  lastPassRemainingEligible: number;
  lastPassRemainingDelayedRetry: number;
  updatedAt: string;
};

export function createDefaultDisplaySyncRuntimeStatus(
  overrides: Partial<DisplaySyncRuntimeStatus> = {},
): DisplaySyncRuntimeStatus {
  return {
    initialized: false,
    running: false,
    authenticatedSessionAvailable: false,
    publicCloudConfigAvailable: false,
    syncInProgress: false,
    pendingFollowUp: false,
    syncRequestedWhileUnavailable: false,
    lastStartAt: null,
    lastStopAt: null,
    lastSyncAttemptAt: null,
    lastSyncCompletedAt: null,
    lastSyncResult: null,
    lastCloudErrorCode: null,
    lastUnavailableReason: null,
    pendingQueueCount: 0,
    lastPassAttempted: 0,
    lastPassSucceeded: 0,
    lastPassFailed: 0,
    lastPassSkipped: 0,
    lastPassRemainingEligible: 0,
    lastPassRemainingDelayedRetry: 0,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
