"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { AccessManagementTabs } from "@/components/access-management/AccessManagementTabs";
import { EMPTY_ACCESS_DIRECTORY } from "@/lib/access-management/actions";
import { createDesktopAccessActions } from "@/lib/access-management/desktop-actions";
import type { AccessManagementDirectory } from "@/lib/access-management/types";
import { localGetAuthStatus } from "@/lib/local/auth-api";
import { localFetch } from "@/lib/local/api";
import { localGetCloudAccessDirectory, localGetCloudAccessDirectoryDiagnostics } from "@/lib/local/cloud-access-api";
import { isLocalApiError } from "@/lib/local/errors";
import { resolveDesktopLocalApiConfig } from "@/lib/local/local-api-origin";

const DIRECTORY_POLL_INTERVAL_MS = 45_000;

type CloudAccessFallbackReason =
  | "offline"
  | "no_session"
  | "cloud_reauthentication_required"
  | "schema_missing"
  | "cloud_config_missing"
  | "session_restoring"
  | "session_refresh_failed_transient"
  | "client_initialization_failed"
  | "directory_rpc_missing"
  | "directory_permission_denied"
  | "directory_request_failed"
  | "directory_parse_failed"
  | "cloud_access_bridge_not_initialized"
  | "connection_refused"
  | "local_api_unreachable"
  | "route_not_found"
  | "malformed_response"
  | "cache_write_failed"
  | "cache_empty"
  | "none";

type CloudAccessDirectoryResponse = AccessManagementDirectory & {
  ok: boolean;
  offline?: boolean;
  stale?: boolean;
  syncedAt?: string | null;
  fallbackReason?: CloudAccessFallbackReason | null;
  error?: string | null;
  warning?: string | null;
};

function resolvePrimaryMessage(
  reason: CloudAccessFallbackReason | null,
  error: string | null,
  warning: string | null,
): string | null {
  if (warning) {
    return warning;
  }

  switch (reason) {
    case "schema_missing":
      return "Access cache could not be initialized.";
    case "no_session":
      return "Sign in to load and manage cloud access.";
    case "cloud_reauthentication_required":
      return "Your cloud session has expired. Sign in again to resume publishing and access management.";
    case "cloud_config_missing":
      return "Cloud access is not configured.";
    case "session_restoring":
      return "Restoring cloud access…";
    case "session_refresh_failed_transient":
    case "client_initialization_failed":
      return error ?? "Cloud access could not be restored. Retry.";
    case "offline":
      return "Access management requires an internet connection. Cached access data is shown read-only.";
    case "directory_rpc_missing":
    case "directory_request_failed":
    case "directory_parse_failed":
      return "Access management data could not be loaded. Retry.";
    case "directory_permission_denied":
      return "You do not have permission to view cloud access management data.";
    case "cloud_access_bridge_not_initialized":
      return "Cloud access service could not be initialized. Retry.";
    case "connection_refused":
    case "local_api_unreachable":
    case "route_not_found":
    case "malformed_response":
      return "Access management service could not be reached. Retry.";
    case "cache_write_failed":
      return "Access data loaded, but the offline cache could not be updated.";
    case "cache_empty":
    case "none":
      return null;
    default:
      return error;
  }
}

function hasDirectoryContent(directory: AccessManagementDirectory): boolean {
  return (
    directory.teams.length > 0 ||
    directory.users.length > 0 ||
    directory.projects.length > 0 ||
    directory.invitations.length > 0
  );
}

export function DesktopCloudAccessManagementClient() {
  const [directory, setDirectory] = useState<AccessManagementDirectory>(EMPTY_ACCESS_DIRECTORY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [fallbackReason, setFallbackReason] = useState<CloudAccessFallbackReason | null>(null);
  const [hasCloudSession, setHasCloudSession] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [diagnosticHint, setDiagnosticHint] = useState<string | null>(null);
  const retryInFlightRef = useRef(false);
  const initialLoadCompletedRef = useRef(false);

  const actions = useMemo(() => createDesktopAccessActions(setDirectory), []);

  const applyDirectoryPayload = useCallback((payload: CloudAccessDirectoryResponse) => {
    const reason = (payload.fallbackReason as CloudAccessFallbackReason | null) ?? null;

    if (payload.ok) {
      setDirectory(payload);
      setSyncedAt(payload.syncedAt ?? new Date().toISOString());
      setStale(Boolean(payload.stale));
      setFallbackReason(reason);
      setWarning(payload.warning ?? null);

      if (!payload.stale && (reason === null || reason === "none" || reason === "cache_write_failed")) {
        setError(payload.warning ?? null);
      } else if (payload.stale && reason && reason !== "no_session" && reason !== "offline") {
        setError(resolvePrimaryMessage(reason, payload.error ?? null, null));
      } else if (payload.stale && reason === "no_session" && hasDirectoryContent(payload)) {
        setError(null);
      } else if (payload.stale && reason === "no_session") {
        setError(resolvePrimaryMessage(reason, payload.error ?? null, payload.warning ?? null));
      } else if (payload.stale && reason === "offline") {
        setError(resolvePrimaryMessage(reason, payload.error ?? null, payload.warning ?? null));
      } else {
        setError(null);
      }
      return;
    }

    setDirectory((previous) => (hasDirectoryContent(previous) ? previous : EMPTY_ACCESS_DIRECTORY));
    setFallbackReason(reason ?? "directory_request_failed");
    setError(
      resolvePrimaryMessage(
        reason ?? "directory_request_failed",
        payload.error ?? null,
        payload.warning ?? null,
      ),
    );
    setStale(Boolean(payload.offline || payload.stale));
  }, []);

  const reload = useCallback(async (options?: { forceRefresh?: boolean; silent?: boolean }) => {
    if (retryInFlightRef.current && options?.forceRefresh) {
      return;
    }
    if (options?.forceRefresh) {
      retryInFlightRef.current = true;
    }

    const silent = Boolean(options?.silent);
    if (!silent) {
      setLoading(!initialLoadCompletedRef.current);
      setError(null);
      setWarning(null);
      setFallbackReason(null);
      setDiagnosticHint(null);
    }

    try {
      await resolveDesktopLocalApiConfig();
      const authStatus = await localGetAuthStatus();
      const cloudReady = Boolean(authStatus.authenticatedCloudSessionAvailable);
      setIsConnected(cloudReady || authStatus.connectionStatus === "connected");
      setHasCloudSession(cloudReady);

      if (!cloudReady && authStatus.localSessionValid) {
        await new Promise((resolve) => setTimeout(resolve, 750));
      }

      let sessionUserId: string | null = null;
      try {
        const session = await localFetch<{
          userId: string | null;
          email: string | null;
        }>("/api/auth/session");
        sessionUserId = session.userId;
      } catch {
        sessionUserId = null;
      }

      const payload = (await localGetCloudAccessDirectory({
        forceRefresh: options?.forceRefresh,
      })) as CloudAccessDirectoryResponse;

      applyDirectoryPayload(payload);

      const authEmail = authStatus.auth.email?.toLowerCase() ?? null;
      const matchedDirectoryUser = authEmail
        ? payload.users.find((user) => user.email.toLowerCase() === authEmail)
        : null;
      setCurrentUserId(sessionUserId ?? matchedDirectoryUser?.id ?? null);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Unable to load cloud access directory.";
      let reason: CloudAccessFallbackReason = "directory_request_failed";
      if (isLocalApiError(loadError)) {
        if (loadError.status === 404) {
          reason = "route_not_found";
        } else if (message.includes("connection refused")) {
          reason = "connection_refused";
        } else if (message.includes("could not be reached")) {
          reason = "local_api_unreachable";
        } else if (loadError.status === 504) {
          reason = "local_api_unreachable";
        }
      } else if (message.includes("Access cache could not be initialized")) {
        reason = "schema_missing";
      } else if (message.includes("authenticated cloud session") || message.includes("Sign in")) {
        reason = "no_session";
      } else if (message.includes("Cloud access is not configured")) {
        reason = "cloud_config_missing";
      } else if (message.includes("Restoring cloud access")) {
        reason = "session_restoring";
      } else if (message.includes("Cloud access could not be restored")) {
        reason = "session_refresh_failed_transient";
      } else if (message.includes("internet connection")) {
        reason = "offline";
      }
      setFallbackReason(reason);
      setError(resolvePrimaryMessage(reason, message, null));
      setStale(reason === "offline");
      setDirectory((previous) => (hasDirectoryContent(previous) ? previous : EMPTY_ACCESS_DIRECTORY));

      const directoryFailureReasons: CloudAccessFallbackReason[] = [
        "directory_request_failed",
        "directory_rpc_missing",
        "directory_permission_denied",
        "directory_parse_failed",
      ];
      if (directoryFailureReasons.includes(reason)) {
        try {
          const diagnostics = await localGetCloudAccessDirectoryDiagnostics();
          const rpcName =
            typeof diagnostics.directoryRpcName === "string"
              ? diagnostics.directoryRpcName
              : null;
          const rpcErrorCode =
            typeof diagnostics.directoryRpcErrorCode === "string"
              ? diagnostics.directoryRpcErrorCode
              : null;
          const rpcErrorMessage =
            typeof diagnostics.directoryRpcErrorMessage === "string"
              ? diagnostics.directoryRpcErrorMessage
              : null;
          const stage =
            typeof diagnostics.firstCloudAccessFailureStage === "string"
              ? diagnostics.firstCloudAccessFailureStage
              : null;
          const parts = [
            rpcName ? `RPC: ${rpcName}` : null,
            rpcErrorCode ? `code=${rpcErrorCode}` : null,
            rpcErrorMessage ? rpcErrorMessage : null,
            stage ? `stage=${stage}` : null,
          ].filter(Boolean);
          if (parts.length > 0) {
            setDiagnosticHint(parts.join(" · "));
          }
        } catch {
          // diagnostics are best-effort
        }
      }
    } finally {
      retryInFlightRef.current = false;
      initialLoadCompletedRef.current = true;
      setLoading(false);
    }
  }, [applyDirectoryPayload]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void reload({ forceRefresh: true, silent: true });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [reload]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void reload({ forceRefresh: true, silent: true });
    }, DIRECTORY_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [reload]);

  const handleRetry = () => {
    startTransition(() => {
      void reload({ forceRefresh: true });
    });
  };

  if (loading) {
    return <p className="text-sm text-muted">Loading access management data…</p>;
  }

  const showOfflineReadOnlyBanner =
    fallbackReason === "offline" && stale && Boolean(syncedAt || directory.teams.length > 0);
  const showNoSessionBanner =
    fallbackReason === "no_session" || fallbackReason === "cloud_reauthentication_required";
  const showFailureBanner =
    fallbackReason === "directory_request_failed" ||
    fallbackReason === "connection_refused" ||
    fallbackReason === "local_api_unreachable" ||
    fallbackReason === "route_not_found" ||
    fallbackReason === "malformed_response" ||
    fallbackReason === "cloud_access_bridge_not_initialized" ||
    fallbackReason === "directory_rpc_missing" ||
    fallbackReason === "directory_permission_denied" ||
    fallbackReason === "directory_parse_failed" ||
    fallbackReason === "schema_missing" ||
    fallbackReason === "cloud_config_missing" ||
    fallbackReason === "session_refresh_failed_transient" ||
    fallbackReason === "client_initialization_failed";
  const showRestoringBanner = fallbackReason === "session_restoring";
  const showCacheWriteWarning = fallbackReason === "cache_write_failed";

  const mutationsEnabled =
    hasCloudSession &&
    isConnected &&
    !showFailureBanner &&
    !showNoSessionBanner &&
    !showRestoringBanner &&
    fallbackReason !== "offline" &&
    !stale;

  return (
    <div className="space-y-4">
      {error && (showFailureBanner || showNoSessionBanner || showRestoringBanner) ? (
        <Alert variant={fallbackReason === "schema_missing" ? "error" : "info"}>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              {showFailureBanner ? (
                <Button type="button" variant="secondary" size="sm" onClick={handleRetry}>
                  Retry
                </Button>
              ) : null}
            </div>
            {diagnosticHint ? (
              <p className="text-xs text-muted">{diagnosticHint}</p>
            ) : null}
          </div>
        </Alert>
      ) : null}

      {showOfflineReadOnlyBanner ? <Alert variant="info">{error}</Alert> : null}

      {showCacheWriteWarning && warning ? <Alert variant="info">{warning}</Alert> : null}

      {isPending ? <p className="text-sm text-muted">Refreshing access directory…</p> : null}

      <Suspense fallback={<p className="text-sm text-muted">Loading access management…</p>}>
        <AccessManagementTabs
          directory={directory}
          currentUserId={currentUserId}
          isOnline={mutationsEnabled}
          showOfflineConnectionMessage={fallbackReason === "offline"}
          syncedAt={syncedAt}
          stale={stale}
          actions={mutationsEnabled ? actions : undefined}
        />
      </Suspense>
    </div>
  );
}
