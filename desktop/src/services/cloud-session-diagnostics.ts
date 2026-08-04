export const CLOUD_SESSION_DIAGNOSTICS_KEY = "cloudSession.diagnostics";

export type CloudSessionDiagnostics = {
  rendererSignInSucceeded: boolean | null;
  accessTokenReceived: boolean | null;
  refreshTokenReceived: boolean | null;
  sessionSentToMain: boolean | null;
  sessionStoredInMain: boolean | null;
  refreshTokenPersisted: boolean | null;
  accessTokenPersisted: boolean | null;
  persistedSessionDecryptable: boolean | null;
  sessionStoredNotificationFired: boolean | null;
  coordinatorReceivedSession: boolean | null;
  cloudServicesStartRequested: boolean | null;
  publishingManagerStartRequested: boolean | null;
  lastSessionStoreAt: string | null;
  lastSessionRestoreAt: string | null;
  lastSessionErrorCode: string | null;
  lastNotificationAt: string | null;
  lastPublishingManagerStartReason: string | null;
  updatedAt: string;
};

export function createDefaultCloudSessionDiagnostics(
  overrides: Partial<CloudSessionDiagnostics> = {},
): CloudSessionDiagnostics {
  return {
    rendererSignInSucceeded: null,
    accessTokenReceived: null,
    refreshTokenReceived: null,
    sessionSentToMain: null,
    sessionStoredInMain: null,
    refreshTokenPersisted: null,
    accessTokenPersisted: null,
    persistedSessionDecryptable: null,
    sessionStoredNotificationFired: null,
    coordinatorReceivedSession: null,
    cloudServicesStartRequested: null,
    publishingManagerStartRequested: null,
    lastSessionStoreAt: null,
    lastSessionRestoreAt: null,
    lastSessionErrorCode: null,
    lastNotificationAt: null,
    lastPublishingManagerStartReason: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
