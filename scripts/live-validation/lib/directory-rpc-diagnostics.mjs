export function readErrorField(error, field) {
  if (!error || typeof error !== "object") {
    return null;
  }
  const value = error[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function extractSqlState(error) {
  const details = readErrorField(error, "details");
  const message = readErrorField(error, "message");
  const haystack = `${details ?? ""} ${message ?? ""}`;
  const match = haystack.match(/\b([0-9A-Z]{5})\b/);
  return match?.[1] ?? null;
}

export function classifyDirectoryRpcSafeCategory(error) {
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

  if (code === "42501" || sqlState === "42501" || message.includes("permission denied")) {
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

export function inferDirectoryRpcFailureSection(category) {
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

export function buildDirectoryRpcDiagnosticsFromError(error, base = {}) {
  const category = classifyDirectoryRpcSafeCategory(error);
  const message = readErrorField(error, "message");
  return {
    directoryRpcPostgrestCode: readErrorField(error, "code"),
    directoryRpcSqlState: extractSqlState(error),
    directoryRpcSafeMessage: message ? message.slice(0, 240) : null,
    directoryRpcSafeCategory: category,
    directoryRpcFailureSection: inferDirectoryRpcFailureSection(category),
    directoryRpcFunctionSignature: "get_access_management_directory(p_include_fixtures boolean default false)",
    ...base,
  };
}

export function buildDirectoryRpcDiagnosticsFromPayload(data, base = {}) {
  const resultType = data === null ? "null" : Array.isArray(data) ? "array" : typeof data;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      directoryRpcRawResultType: resultType,
      directoryRpcSafeCategory: "response_contract_mismatch",
      directoryRpcFailureSection: "result_parsing",
      directoryRpcSafeMessage: "Directory RPC returned an unexpected container type.",
      directoryRpcFunctionSignature: "get_access_management_directory(p_include_fixtures boolean default false)",
      ...base,
    };
  }

  const topLevelKeys = Object.keys(data);
  if (data.ok !== true) {
    const code = typeof data.code === "string" ? data.code : "forbidden";
    return {
      directoryRpcRawResultType: resultType,
      directoryRpcTopLevelKeys: topLevelKeys,
      directoryRpcSafeCategory:
        code === "authentication_required" ? "permission_denied" : "response_contract_mismatch",
      directoryRpcFailureSection:
        code === "authentication_required" ? "permission_checks" : "result_parsing",
      directoryRpcSafeMessage: `Directory RPC returned ok=false (${code}).`,
      directoryRpcCallerAuthorized: code !== "forbidden",
      directoryRpcFunctionSignature: "get_access_management_directory(p_include_fixtures boolean default false)",
      ...base,
    };
  }

  const countArray = (value) => (Array.isArray(value) ? value.length : 0);

  return {
    directoryRpcRawResultType: resultType,
    directoryRpcTopLevelKeys: topLevelKeys,
    directoryRpcSafeCategory: null,
    directoryRpcFailureSection: "none",
    directoryRpcCallerAuthorized: true,
    directoryRpcFunctionSignature: "get_access_management_directory(p_include_fixtures boolean default false)",
    directoryRpcEntityCounts: {
      teams: countArray(data.teams),
      users: countArray(data.users),
      projects: countArray(data.projects),
      invitations: countArray(data.invitations),
    },
    ...base,
  };
}

export function parseCloudAccessDirectoryResponse(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, code: "directory_parse_failed" };
  }

  if (data.ok !== true) {
    return { ok: false, code: data.code ?? "forbidden" };
  }

  return {
    ok: true,
    teams: data.teams ?? [],
    teamMemberships: data.teamMemberships ?? [],
    users: data.users ?? [],
    projects: data.projects ?? [],
    projectMembers: data.projectMembers ?? [],
    projectTeams: data.projectTeams ?? [],
    invitations: data.invitations ?? [],
  };
}

export function directoryContractValid(data) {
  const parsed = parseCloudAccessDirectoryResponse(data);
  if (!parsed.ok) {
    return { ok: false, stage: "result_parsing", code: parsed.code };
  }

  const requiredArrays = [
    "teams",
    "teamMemberships",
    "users",
    "projects",
    "projectMembers",
    "projectTeams",
    "invitations",
  ];
  for (const key of requiredArrays) {
    if (!Array.isArray(parsed[key])) {
      return { ok: false, stage: "result_parsing", code: "missing_array", key };
    }
  }

  return { ok: true, stage: "none", counts: {
    teams: parsed.teams.length,
    users: parsed.users.length,
    projects: parsed.projects.length,
    invitations: parsed.invitations.length,
  } };
}
