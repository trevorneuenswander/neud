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

export function logCloudAccessLifecycle(
  event: string,
  payload: Record<string, string | boolean | number | null>,
): void {
  console.info(`[CloudAccess] ${event}`, {
    at: new Date().toISOString(),
    ...payload,
  });
}
