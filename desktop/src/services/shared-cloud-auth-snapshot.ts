import type { SharedCloudAuthDiagnostics } from "./shared-cloud-auth-diagnostics";

/** Authoritative cloud authentication view for every desktop cloud service and diagnostic. */
export type SharedCloudAuthSnapshot = {
  authenticatedCloudSessionAvailable: boolean;
  authenticatedClientReady: boolean;
  hasCloudSession: boolean;
  hasRestorableCloudSession: boolean;
  reauthenticationRequired: boolean;
  tokenExpired: boolean;
  refreshResult: SharedCloudAuthDiagnostics["refreshResult"];
  lastRefreshErrorCode: string | null;
  sessionGeneration: number;
  sessionServiceInstanceIdHash: string | null;
};

export function resolveAuthenticatedCloudSessionAvailable(input: {
  authenticatedClientReady: boolean;
  reauthenticationRequired: boolean;
}): boolean {
  return input.authenticatedClientReady && !input.reauthenticationRequired;
}

export function buildSharedCloudAuthSnapshot(input: {
  diagnostics: SharedCloudAuthDiagnostics;
  hasCloudSession: boolean;
  hasRestorableCloudSession: boolean;
}): SharedCloudAuthSnapshot {
  const authenticatedClientReady = input.diagnostics.authenticatedClientReady;
  const reauthenticationRequired = input.diagnostics.reauthenticationRequired;
  return {
    authenticatedCloudSessionAvailable: resolveAuthenticatedCloudSessionAvailable({
      authenticatedClientReady,
      reauthenticationRequired,
    }),
    authenticatedClientReady,
    hasCloudSession: input.hasCloudSession,
    hasRestorableCloudSession: input.hasRestorableCloudSession,
    reauthenticationRequired,
    tokenExpired: input.diagnostics.tokenExpired,
    refreshResult: input.diagnostics.refreshResult,
    lastRefreshErrorCode: input.diagnostics.lastRefreshErrorCode,
    sessionGeneration: input.diagnostics.sessionGeneration,
    sessionServiceInstanceIdHash: input.diagnostics.sessionServiceInstanceIdHash,
  };
}
