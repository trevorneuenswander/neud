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
  refreshResult: "success" | "failure" | "not_attempted" | "still_fresh";
  refreshErrorCode: string | null;
  refreshErrorCategory: string | null;
  refreshTokenRotated: boolean;
  refreshedSessionPersisted: boolean;
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
    refreshResult: "not_attempted",
    refreshErrorCode: null,
    refreshErrorCategory: null,
    refreshTokenRotated: false,
    refreshedSessionPersisted: false,
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
    sessionNotificationFired: false,
    sessionServiceInstanceIdHash: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
