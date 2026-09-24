export const SHARED_CLOUD_AUTH_DIAGNOSTICS_KEY = "sharedCloudAuth.diagnostics";

export type SharedCloudAuthFailureStage =
  | "session_file_missing"
  | "session_decrypt_failed"
  | "token_expired"
  | "refresh_network_failed"
  | "refresh_token_invalid"
  | "refresh_response_invalid"
  | "session_persist_failed"
  | "client_creation_failed"
  | "set_session_failed"
  | "project_ref_mismatch"
  | "dependent_service_not_notified"
  | "none";

export type SharedCloudAuthDiagnostics = {
  persistedSessionPresent: boolean;
  persistedSessionDecryptable: boolean;
  tokenExpiryAt: string | null;
  tokenExpired: boolean;
  refreshTokenPresent: boolean;
  accessTokenPresent: boolean;
  accessTokenExpired: boolean;
  refreshAttemptedAt: string | null;
  refreshHttpAttempted: boolean;
  refreshHttpStatus: number | null;
  refreshSupabaseErrorCode: string | null;
  refreshSupabaseErrorName: string | null;
  refreshSafeMessage: string | null;
  refreshResult: "success" | "failure" | "not_attempted" | "still_fresh";
  refreshErrorCode: string | null;
  refreshErrorCategory: string | null;
  refreshTokenRotated: boolean;
  refreshTokenChangedAfterSuccess: boolean;
  responseContainedSession: boolean;
  responseContainedAccessToken: boolean;
  responseContainedRefreshToken: boolean;
  refreshedSessionPersisted: boolean;
  configuredSupabaseProjectRef: string | null;
  storedSessionIssuerProjectRef: string | null;
  projectRefsMatch: boolean | null;
  configSource: string | null;
  publicConfigPresent: boolean;
  authenticatedClientCreated: boolean;
  setSessionSucceeded: boolean;
  authenticatedClientReady: boolean;
  reauthenticationRequired: boolean;
  sessionGeneration: number;
  sessionUpdatedAt: string | null;
  lastRefreshAttemptAt: string | null;
  lastRefreshResult: "success" | "failure" | "not_attempted" | "still_fresh";
  lastRefreshErrorCode: string | null;
  firstSharedCloudFailureStage: SharedCloudAuthFailureStage;
  firstRefreshFailureStage: string | null;
  runtimeKind: string | null;
  nodeVersion: string | null;
  electronVersion: string | null;
  nativeWebSocketAvailable: boolean | null;
  configuredWebSocketTransport: string | null;
  supabaseClientFactory: string | null;
  realtimeEnabled: boolean | null;
  authRefreshTransportReady: boolean | null;
  sessionNotificationFired: boolean;
  sessionServiceInstanceIdHash: string | null;
  updatedAt: string;
};

export function createDefaultSharedCloudAuthDiagnostics(
  overrides: Partial<SharedCloudAuthDiagnostics> = {},
): SharedCloudAuthDiagnostics {
  return {
    persistedSessionPresent: false,
    persistedSessionDecryptable: false,
    tokenExpiryAt: null,
    tokenExpired: false,
    refreshTokenPresent: false,
    accessTokenPresent: false,
    accessTokenExpired: false,
    refreshAttemptedAt: null,
    refreshHttpAttempted: false,
    refreshHttpStatus: null,
    refreshSupabaseErrorCode: null,
    refreshSupabaseErrorName: null,
    refreshSafeMessage: null,
    refreshResult: "not_attempted",
    refreshErrorCode: null,
    refreshErrorCategory: null,
    refreshTokenRotated: false,
    refreshTokenChangedAfterSuccess: false,
    responseContainedSession: false,
    responseContainedAccessToken: false,
    responseContainedRefreshToken: false,
    refreshedSessionPersisted: false,
    configuredSupabaseProjectRef: null,
    storedSessionIssuerProjectRef: null,
    projectRefsMatch: null,
    configSource: null,
    publicConfigPresent: false,
    authenticatedClientCreated: false,
    setSessionSucceeded: false,
    authenticatedClientReady: false,
    reauthenticationRequired: false,
    sessionGeneration: 0,
    sessionUpdatedAt: null,
    lastRefreshAttemptAt: null,
    lastRefreshResult: "not_attempted",
    lastRefreshErrorCode: null,
    firstSharedCloudFailureStage: "none",
    firstRefreshFailureStage: null,
    runtimeKind: null,
    nodeVersion: null,
    electronVersion: null,
    nativeWebSocketAvailable: null,
    configuredWebSocketTransport: null,
    supabaseClientFactory: null,
    realtimeEnabled: null,
    authRefreshTransportReady: null,
    sessionNotificationFired: false,
    sessionServiceInstanceIdHash: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
