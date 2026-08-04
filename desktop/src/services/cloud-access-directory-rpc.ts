import {
  CloudAccessDirectoryError,
  type CloudAccessFallbackReason,
} from "./cloud-access-directory";

export type DirectoryRpcSafeCategory =
  | "function_missing"
  | "signature_mismatch"
  | "permission_denied"
  | "rls_denied"
  | "ambiguous_column"
  | "missing_column"
  | "invalid_enum"
  | "json_construction_failed"
  | "response_contract_mismatch"
  | "unknown_rpc_error";

export type DirectoryRpcFailureSection =
  | "before_function_body"
  | "permission_checks"
  | "directory_queries"
  | "json_construction"
  | "result_parsing"
  | "none";

export const ACCESS_MANAGEMENT_DIRECTORY_RPC_NAME = "get_access_management_directory";

export const ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS = {
  p_include_fixtures: false,
} as const;

export const ACCESS_MANAGEMENT_DIRECTORY_RPC_SIGNATURE =
  "get_access_management_directory(p_include_fixtures boolean default false)";

export type DirectoryRpcDiagnostics = {
  directoryRpcPostgrestCode: string | null;
  directoryRpcSqlState: string | null;
  directoryRpcSafeMessage: string | null;
  directoryRpcSafeCategory: DirectoryRpcSafeCategory | null;
  directoryRpcFailureSection: DirectoryRpcFailureSection;
  directoryRpcFunctionSignature: string;
  directoryRpcCallerUidPresent: boolean | null;
  directoryRpcCallerAuthorized: boolean | null;
  directoryRpcCallerPlatformRole: string | null;
  directoryRpcCallerTeamMembershipCount: number | null;
  directoryRpcRawResultType: string | null;
  directoryRpcTopLevelKeys: string[] | null;
  directoryRpcEntityCounts: {
    teams: number;
    users: number;
    projects: number;
    invitations: number;
  } | null;
};

export function createEmptyDirectoryRpcDiagnostics(): DirectoryRpcDiagnostics {
  return {
    directoryRpcPostgrestCode: null,
    directoryRpcSqlState: null,
    directoryRpcSafeMessage: null,
    directoryRpcSafeCategory: null,
    directoryRpcFailureSection: "none",
    directoryRpcFunctionSignature: ACCESS_MANAGEMENT_DIRECTORY_RPC_SIGNATURE,
    directoryRpcCallerUidPresent: null,
    directoryRpcCallerAuthorized: null,
    directoryRpcCallerPlatformRole: null,
    directoryRpcCallerTeamMembershipCount: null,
    directoryRpcRawResultType: null,
    directoryRpcTopLevelKeys: null,
    directoryRpcEntityCounts: null,
  };
}

type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function readErrorField(error: unknown, field: "code" | "details" | "hint" | "message"): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const value = (error as SupabaseLikeError)[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractSqlState(error: unknown): string | null {
  const details = readErrorField(error, "details");
  const message = readErrorField(error, "message");
  const haystack = `${details ?? ""} ${message ?? ""}`;
  const match = haystack.match(/\b([0-9A-Z]{5})\b/);
  return match?.[1] ?? null;
}

export function classifyDirectoryRpcSafeCategory(error: unknown): DirectoryRpcSafeCategory {
  const code = readErrorField(error, "code");
  const sqlState = extractSqlState(error);
  const message = (readErrorField(error, "message") ?? String(error)).toLowerCase();

  if (
    code === "PGRST202" ||
    (message.includes("could not find the function") &&
      message.includes("get_access_management_directory"))
  ) {
    return "function_missing";
  }

  if (
    message.includes("function") &&
    (message.includes("does not exist") || message.includes("no matches"))
  ) {
    return "signature_mismatch";
  }

  if (
    code === "42501" ||
    sqlState === "42501" ||
    message.includes("permission denied")
  ) {
    return "permission_denied";
  }

  if (message.includes("row-level security") || message.includes("rls")) {
    return "rls_denied";
  }

  if (
    code === "42703" ||
    sqlState === "42703" ||
    (message.includes("does not exist") && message.includes("column"))
  ) {
    return "missing_column";
  }

  if (code === "42702" || sqlState === "42702" || message.includes("ambiguous")) {
    return "ambiguous_column";
  }

  if (
    code === "22P02" ||
    sqlState === "22P02" ||
    message.includes("invalid input value for enum")
  ) {
    return "invalid_enum";
  }

  if (message.includes("json") && message.includes("could not")) {
    return "json_construction_failed";
  }

  return "unknown_rpc_error";
}

export function inferDirectoryRpcFailureSection(
  category: DirectoryRpcSafeCategory,
): DirectoryRpcFailureSection {
  switch (category) {
    case "function_missing":
    case "signature_mismatch":
    case "permission_denied":
      return "before_function_body";
    case "rls_denied":
      return "permission_checks";
    case "ambiguous_column":
    case "missing_column":
    case "invalid_enum":
      return "directory_queries";
    case "json_construction_failed":
      return "json_construction";
    case "response_contract_mismatch":
      return "result_parsing";
    default:
      return "directory_queries";
  }
}

export function buildDirectoryRpcDiagnosticsFromError(
  error: unknown,
  base: DirectoryRpcDiagnostics = createEmptyDirectoryRpcDiagnostics(),
): DirectoryRpcDiagnostics {
  const category = classifyDirectoryRpcSafeCategory(error);
  const message = readErrorField(error, "message");
  return {
    ...base,
    directoryRpcPostgrestCode: readErrorField(error, "code"),
    directoryRpcSqlState: extractSqlState(error),
    directoryRpcSafeMessage: message ? message.slice(0, 240) : null,
    directoryRpcSafeCategory: category,
    directoryRpcFailureSection: inferDirectoryRpcFailureSection(category),
  };
}

export function buildDirectoryRpcDiagnosticsFromPayload(
  data: unknown,
  base: DirectoryRpcDiagnostics = createEmptyDirectoryRpcDiagnostics(),
): DirectoryRpcDiagnostics {
  const resultType =
    data === null ? "null" : Array.isArray(data) ? "array" : typeof data;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      ...base,
      directoryRpcRawResultType: resultType,
      directoryRpcSafeCategory: "response_contract_mismatch",
      directoryRpcFailureSection: "result_parsing",
      directoryRpcSafeMessage: "Directory RPC returned an unexpected container type.",
    };
  }

  const payload = data as Record<string, unknown>;
  const topLevelKeys = Object.keys(payload);
  const ok = payload.ok === true;

  if (!ok) {
    const code = typeof payload.code === "string" ? payload.code : "forbidden";
    return {
      ...base,
      directoryRpcRawResultType: resultType,
      directoryRpcTopLevelKeys: topLevelKeys,
      directoryRpcSafeCategory:
        code === "authentication_required" ? "permission_denied" : "response_contract_mismatch",
      directoryRpcFailureSection:
        code === "authentication_required" ? "permission_checks" : "result_parsing",
      directoryRpcSafeMessage: `Directory RPC returned ok=false (${code}).`,
      directoryRpcCallerAuthorized: code !== "forbidden",
    };
  }

  const countArray = (value: unknown) => (Array.isArray(value) ? value.length : 0);

  return {
    ...base,
    directoryRpcRawResultType: resultType,
    directoryRpcTopLevelKeys: topLevelKeys,
    directoryRpcSafeCategory: null,
    directoryRpcFailureSection: "none",
    directoryRpcCallerAuthorized: true,
    directoryRpcEntityCounts: {
      teams: countArray(payload.teams),
      users: countArray(payload.users),
      projects: countArray(payload.projects),
      invitations: countArray(payload.invitations),
    },
  };
}

export function directoryRpcCategoryToCloudAccessError(
  category: DirectoryRpcSafeCategory | null,
): CloudAccessDirectoryError {
  let code: CloudAccessFallbackReason = "directory_request_failed";
  let message = "Access management data could not be loaded.";

  switch (category) {
    case "function_missing":
    case "signature_mismatch":
      code = "directory_rpc_missing";
      message = "Access management data could not be loaded. Retry.";
      break;
    case "permission_denied":
    case "rls_denied":
      code = "directory_permission_denied";
      message = "You do not have permission to view cloud access management data.";
      break;
    case "response_contract_mismatch":
      code = "directory_parse_failed";
      message = "Access management data could not be loaded. Retry.";
      break;
    default:
      message = "Access management data could not be loaded. Retry.";
      break;
  }

  return new CloudAccessDirectoryError(code, message);
}
