#!/usr/bin/env node

export function resolveAuthenticatedCloudSessionAvailable(sharedCloudAuth) {
  if (!sharedCloudAuth || typeof sharedCloudAuth !== "object") {
    return false;
  }
  return (
    sharedCloudAuth.authenticatedClientReady === true &&
    sharedCloudAuth.reauthenticationRequired !== true
  );
}

export function buildSharedCloudAuthSnapshot(sharedCloudAuth, overrides = {}) {
  const auth = sharedCloudAuth ?? {};
  const authenticatedClientReady = auth.authenticatedClientReady === true;
  const reauthenticationRequired = auth.reauthenticationRequired === true;
  return {
    authenticatedCloudSessionAvailable: resolveAuthenticatedCloudSessionAvailable(auth),
    authenticatedClientReady,
    hasCloudSession: overrides.hasCloudSession ?? null,
    hasRestorableCloudSession: overrides.hasRestorableCloudSession ?? null,
    reauthenticationRequired,
    tokenExpired: auth.tokenExpired ?? null,
    refreshResult: auth.refreshResult ?? auth.lastRefreshResult ?? null,
    lastRefreshErrorCode: auth.lastRefreshErrorCode ?? null,
    sessionGeneration: auth.sessionGeneration ?? null,
    sessionServiceInstanceIdHash: auth.sessionServiceInstanceIdHash ?? null,
  };
}
