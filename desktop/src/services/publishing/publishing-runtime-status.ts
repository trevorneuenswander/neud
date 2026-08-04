export const PUBLISHING_RUNTIME_STATUS_KEY = "publishing.runtimeStatus";

export type PublishingRuntimeStatus = {
  initialized: boolean;
  running: boolean;
  authenticatedSessionAvailable: boolean;
  heartbeatTimerActive: boolean;
  lastHeartbeatAttemptAt: string | null;
  lastHeartbeatSuccessAt: string | null;
  lastHeartbeatErrorCode: string | null;
  lastStartReason: string | null;
  lastStopReason: string | null;
  startRequestedAt: string | null;
  startRequestReason: string | null;
  startAccepted: boolean;
  startRejectedReason: string | null;
  authenticatedSessionAvailableAtStart: boolean;
  eligibleOnlineDisplayCountAtStart: number | null;
  heartbeatTimerCreatedAt: string | null;
  firstHeartbeatAttemptAt: string | null;
  firstHeartbeatResult: string | null;
  updatedAt: string;
};

export function createDefaultPublishingRuntimeStatus(
  overrides: Partial<PublishingRuntimeStatus> = {},
): PublishingRuntimeStatus {
  return {
    initialized: false,
    running: false,
    authenticatedSessionAvailable: false,
    heartbeatTimerActive: false,
    lastHeartbeatAttemptAt: null,
    lastHeartbeatSuccessAt: null,
    lastHeartbeatErrorCode: null,
    lastStartReason: null,
    lastStopReason: null,
    startRequestedAt: null,
    startRequestReason: null,
    startAccepted: false,
    startRejectedReason: null,
    authenticatedSessionAvailableAtStart: false,
    eligibleOnlineDisplayCountAtStart: null,
    heartbeatTimerCreatedAt: null,
    firstHeartbeatAttemptAt: null,
    firstHeartbeatResult: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
