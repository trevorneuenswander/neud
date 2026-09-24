import type { SupabaseClient } from "@supabase/supabase-js";

export type CloudAccessSessionState =
  | "no_persisted_session"
  | "session_restoring"
  | "session_ready"
  | "session_refresh_failed_transient"
  | "invalid_refresh_token"
  | "authenticated_client_initialization_failed"
  | "cloud_config_missing";

export type FirstCloudAccessFailureStage =
  | "no_session"
  | "session_restore_pending"
  | "cloud_config_missing"
  | "client_provider_not_wired"
  | "client_creation_failed"
  | "token_refresh_failed"
  | "directory_rpc_failed"
  | "directory_parse_failed"
  | "cache_write_failed"
  | "none";

export type AuthenticatedClientAcquisitionResult = {
  client: SupabaseClient | null;
  sessionState: CloudAccessSessionState;
  errorCode: string | null;
  clientCreationAttempted: boolean;
  clientCreationSucceeded: boolean;
  sessionRefreshAttempted: boolean;
  sessionRefreshResult: "success" | "failure" | "not_attempted" | "still_fresh";
};

export type AuthenticatedClientProvider = {
  getInstanceIdHash(): string;
  isCloudConfigured(): boolean;
  hasRestorableSession(): boolean;
  getSessionState(): CloudAccessSessionState;
  acquireAuthenticatedClient(
    reason: string,
    options?: { forceRefresh?: boolean },
  ): Promise<AuthenticatedClientAcquisitionResult>;
};

const cloudAccessMetrics = {
  clientRequestCount: 0,
  sessionRefreshAttempts: 0,
  clientCacheHits: 0,
};

export function getCloudAccessStartupMetrics(): typeof cloudAccessMetrics {
  return { ...cloudAccessMetrics };
}

export function resetCloudAccessStartupMetrics(): void {
  cloudAccessMetrics.clientRequestCount = 0;
  cloudAccessMetrics.sessionRefreshAttempts = 0;
  cloudAccessMetrics.clientCacheHits = 0;
}

export function recordCloudAccessSessionRefreshAttempt(): void {
  cloudAccessMetrics.sessionRefreshAttempts += 1;
}

export function isCloudAccessDebugEnabled(): boolean {
  return process.env.NEUD_DEBUG_CLOUD_ACCESS === "1";
}

export function logCloudAccessLifecycle(
  event: string,
  payload: Record<string, string | boolean | number | null>,
): void {
  if (event === "client_request") {
    cloudAccessMetrics.clientRequestCount += 1;
  }
  if (event === "client_available" && payload.sessionRefreshResult === "cache_hit") {
    cloudAccessMetrics.clientCacheHits += 1;
  }

  if (!isCloudAccessDebugEnabled()) {
    return;
  }

  console.info(`[CloudAccess] ${event}`, {
    at: new Date().toISOString(),
    ...payload,
  });
}
