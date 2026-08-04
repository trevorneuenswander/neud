export type CloudAccessFallbackReason =
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

export type CloudAccessDirectoryEntityCounts = {
  teams: number;
  users: number;
  projects: number;
  invitations: number;
};

export type ParsedCloudAccessDirectory = {
  ok: true;
  teams: unknown[];
  teamMemberships: unknown[];
  users: unknown[];
  projects: unknown[];
  projectMembers: unknown[];
  projectTeams: unknown[];
  invitations: unknown[];
};

import {
  createEmptyDirectoryRpcDiagnostics,
  classifyDirectoryRpcSafeCategory,
  type DirectoryRpcDiagnostics,
} from "./cloud-access-directory-rpc";

export type CloudAccessDirectoryDiagnostics = {
  authenticatedCloudSessionAvailable: boolean;
  cloudSessionRestoreAt: string | null;
  cloudDirectoryRequestAttemptedAt: string | null;
  cloudDirectoryRequestResult: "success" | "failure" | "not_attempted";
  cloudDirectoryHttpStatus: number | null;
  cloudDirectoryRpcAttempted: boolean;
  cloudDirectoryRpcResult: "success" | "failure" | "not_attempted";
  cloudDirectoryErrorCode: string | null;
  cloudDirectoryParsed: boolean;
  cloudDirectoryEntityCounts: CloudAccessDirectoryEntityCounts;
  cacheWriteAttempted: boolean;
  cacheWriteSucceeded: boolean;
  cacheRowCount: number;
  cacheSyncedAt: string | null;
  actualFallbackReason: CloudAccessFallbackReason;
  sessionServiceInstanceIdHash: string | null;
  cloudAccessBridgeInstanceInitialized: boolean;
  bridgeUsesSharedSessionService: boolean;
  persistedTokensPresent: boolean;
  authenticatedClientCreationAttempted: boolean;
  authenticatedClientCreationResult: "success" | "failure" | "not_attempted";
  authenticatedClientCreationErrorCode: string | null;
  sessionRefreshAttempted: boolean;
  sessionRefreshResult: "success" | "failure" | "not_attempted" | "still_fresh";
  directoryRpcAttempted: boolean;
  firstCloudAccessFailureStage: import("./authenticated-client-provider").FirstCloudAccessFailureStage;
} & DirectoryRpcDiagnostics;

export class CloudAccessDirectoryError extends Error {
  readonly code: CloudAccessFallbackReason;

  constructor(code: CloudAccessFallbackReason, message: string) {
    super(message);
    this.name = "CloudAccessDirectoryError";
    this.code = code;
  }
}

export function countCloudAccessDirectoryEntities(
  directory: Partial<ParsedCloudAccessDirectory> | null | undefined,
): CloudAccessDirectoryEntityCounts {
  return {
    teams: Array.isArray(directory?.teams) ? directory.teams.length : 0,
    users: Array.isArray(directory?.users) ? directory.users.length : 0,
    projects: Array.isArray(directory?.projects) ? directory.projects.length : 0,
    invitations: Array.isArray(directory?.invitations) ? directory.invitations.length : 0,
  };
}

export function parseCloudAccessDirectoryResponse(data: unknown): ParsedCloudAccessDirectory {
  if (!data || typeof data !== "object") {
    throw new CloudAccessDirectoryError(
      "directory_parse_failed",
      "Cloud access directory response was malformed.",
    );
  }

  const payload = data as {
    ok?: boolean;
    code?: string;
    teams?: unknown[];
    teamMemberships?: unknown[];
    users?: unknown[];
    projects?: unknown[];
    projectMembers?: unknown[];
    projectTeams?: unknown[];
    invitations?: unknown[];
  };

  if (!payload.ok) {
    const code = payload.code ?? "forbidden";
    if (code === "authentication_required") {
      throw new CloudAccessDirectoryError(
        "no_session",
        "Access management requires an authenticated cloud session.",
      );
    }
    if (code === "forbidden" || code === "42501") {
      throw new CloudAccessDirectoryError(
        "directory_permission_denied",
        "You do not have permission to view cloud access management data.",
      );
    }
    throw new CloudAccessDirectoryError(
      "directory_request_failed",
      "Cloud access directory request was rejected.",
    );
  }

  return {
    ok: true,
    teams: payload.teams ?? [],
    teamMemberships: payload.teamMemberships ?? [],
    users: payload.users ?? [],
    projects: payload.projects ?? [],
    projectMembers: payload.projectMembers ?? [],
    projectTeams: payload.projectTeams ?? [],
    invitations: payload.invitations ?? [],
  };
}

export function classifyCloudAccessDirectoryFailure(
  error: unknown,
  hasCloudSession: boolean,
): CloudAccessDirectoryError {
  if (error instanceof CloudAccessDirectoryError) {
    return error;
  }

  if (error && typeof error === "object" && "code" in error) {
    const category = classifyDirectoryRpcSafeCategory(error);
    if (category === "function_missing") {
      return new CloudAccessDirectoryError(
        "directory_rpc_missing",
        "Cloud access directory RPC is unavailable.",
      );
    }
    if (category === "permission_denied" || category === "rls_denied") {
      return new CloudAccessDirectoryError(
        "directory_permission_denied",
        "You do not have permission to view cloud access management data.",
      );
    }
    if (
      category === "missing_column" ||
      category === "ambiguous_column" ||
      category === "invalid_enum" ||
      category === "json_construction_failed" ||
      category === "unknown_rpc_error"
    ) {
      return new CloudAccessDirectoryError(
        "directory_request_failed",
        "Access management data could not be loaded. Retry.",
      );
    }
  }

  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("Access cache could not be initialized") ||
    message.includes("no such table: cloud_access_cache")
  ) {
    return new CloudAccessDirectoryError("schema_missing", "Access cache could not be initialized.");
  }

  if (message.includes("Cloud access is not configured")) {
    return new CloudAccessDirectoryError("cloud_config_missing", message);
  }

  if (message.includes("Restoring cloud access")) {
    return new CloudAccessDirectoryError("session_restoring", message);
  }

  if (message.includes("Cloud access could not be restored")) {
    return new CloudAccessDirectoryError(
      "session_refresh_failed_transient",
      message,
    );
  }

  if (!hasCloudSession) {
    return new CloudAccessDirectoryError(
      "no_session",
      "Access management requires an authenticated cloud session.",
    );
  }

  const lower = message.toLowerCase();

  if (
    lower.includes("could not find the function") &&
    lower.includes("get_access_management_directory")
  ) {
    return new CloudAccessDirectoryError(
      "directory_rpc_missing",
      "Access management data could not be loaded. Retry.",
    );
  }

  if (
    lower.includes("permission denied") ||
    lower.includes("42501") ||
    lower.includes("forbidden") ||
    lower.includes("not authorized")
  ) {
    return new CloudAccessDirectoryError(
      "directory_permission_denied",
      "You do not have permission to view cloud access management data.",
    );
  }

  if (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("failed to fetch") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("timeout") ||
    lower.includes("abort")
  ) {
    if (lower.includes("econnrefused") || lower.includes("connection refused")) {
      return new CloudAccessDirectoryError(
        "connection_refused",
        "Access management service could not be reached.",
      );
    }

    return new CloudAccessDirectoryError(
      "offline",
      "Access management requires an internet connection.",
    );
  }

  if (lower.includes("jwt") || lower.includes("invalid session") || lower.includes("refresh")) {
    return new CloudAccessDirectoryError(
      "no_session",
      "Access management requires an authenticated cloud session.",
    );
  }

  if (lower.includes("malformed") || lower.includes("invalid response")) {
    return new CloudAccessDirectoryError(
      "directory_parse_failed",
      "Cloud access directory response was malformed.",
    );
  }

  return new CloudAccessDirectoryError(
    "directory_request_failed",
    "Access management data could not be loaded. Retry.",
  );
}

const STALE_CACHE_FALLBACK_REASONS = new Set<CloudAccessFallbackReason>([
  "offline",
  "session_refresh_failed_transient",
  "directory_request_failed",
  "directory_rpc_missing",
  "directory_parse_failed",
]);

export function shouldServeStaleCloudAccessCache(
  reason: CloudAccessFallbackReason,
): boolean {
  return STALE_CACHE_FALLBACK_REASONS.has(reason);
}

export function createEmptyCloudAccessDirectoryDiagnostics(
  actualFallbackReason: CloudAccessFallbackReason = "cache_empty",
): CloudAccessDirectoryDiagnostics {
  return {
    authenticatedCloudSessionAvailable: false,
    cloudSessionRestoreAt: null,
    cloudDirectoryRequestAttemptedAt: null,
    cloudDirectoryRequestResult: "not_attempted",
    cloudDirectoryHttpStatus: null,
    cloudDirectoryRpcAttempted: false,
    cloudDirectoryRpcResult: "not_attempted",
    cloudDirectoryErrorCode: null,
    cloudDirectoryParsed: false,
    cloudDirectoryEntityCounts: {
      teams: 0,
      users: 0,
      projects: 0,
      invitations: 0,
    },
    cacheWriteAttempted: false,
    cacheWriteSucceeded: false,
    cacheRowCount: 0,
    cacheSyncedAt: null,
    actualFallbackReason,
    sessionServiceInstanceIdHash: null,
    cloudAccessBridgeInstanceInitialized: false,
    bridgeUsesSharedSessionService: false,
    persistedTokensPresent: false,
    authenticatedClientCreationAttempted: false,
    authenticatedClientCreationResult: "not_attempted",
    authenticatedClientCreationErrorCode: null,
    sessionRefreshAttempted: false,
    sessionRefreshResult: "not_attempted",
    directoryRpcAttempted: false,
    firstCloudAccessFailureStage: "none",
    ...createEmptyDirectoryRpcDiagnostics(),
  };
}
