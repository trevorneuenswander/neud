import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_LOCAL_API_ORIGIN,
  normalizeLocalApiOrigin,
  parseAppSettingValue,
  resolveLocalApiOriginFromCandidates,
} from "./normalize-local-api-origin.mjs";

export { DEFAULT_LOCAL_API_ORIGIN, normalizeLocalApiOrigin, parseAppSettingValue };

export function resolveSessionConfigPath(appDataRoot) {
  const explicit = process.env.NEUD_LOCAL_SESSION_FILE?.trim();
  if (explicit) {
    return explicit;
  }

  const appDataDir = process.env.NEUD_APP_DATA_DIR?.trim();
  if (appDataDir) {
    return path.join(appDataDir, "config", "local-api-session.json");
  }

  const root = appDataRoot ?? process.env.APPDATA;
  if (!root) {
    return null;
  }

  const candidates = [
    path.join(root, "NEUD", "config", "local-api-session.json"),
    path.join(root, "Electron", "config", "local-api-session.json"),
  ];

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }

  return candidates[candidates.length - 1] ?? null;
}

export function readSessionConfigFromDisk(appDataRoot) {
  const configPath = resolveSessionConfigPath(appDataRoot);
  if (!configPath) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const baseUrl = normalizeLocalApiOrigin(parsed.baseUrl);
    const sessionToken =
      typeof parsed.sessionToken === "string" ? parsed.sessionToken.trim() : null;

    if (baseUrl && sessionToken) {
      return {
        baseUrl,
        sessionToken,
        userId: typeof parsed.userId === "string" ? parsed.userId : "",
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      };
    }
  } catch {
    // missing or invalid session config
  }

  return null;
}

export function resolveLocalApiOrigin(options = {}) {
  const settings = options.settings;
  const sessionConfig = readSessionConfigFromDisk(options.appDataRoot);

  const fromSettings = parseAppSettingValue(settings?.get?.("neud.localApiUrl"));
  const fromEnv =
    normalizeLocalApiOrigin(process.env.NEUD_LOCAL_API_URL) ??
    normalizeLocalApiOrigin(process.env.NEXT_PUBLIC_NEUD_LOCAL_API_URL);
  const parsedSetting = normalizeLocalApiOrigin(fromSettings);
  const sessionTokenFromSettings = parseAppSettingValue(
    settings?.get?.("neud.localApiSessionToken"),
  );
  const sessionToken =
    typeof sessionTokenFromSettings === "string" && sessionTokenFromSettings.trim()
      ? sessionTokenFromSettings.trim()
      : (sessionConfig?.sessionToken ?? null);

  const resolved = resolveLocalApiOriginFromCandidates(
    [fromEnv, parsedSetting, sessionConfig?.baseUrl],
    DEFAULT_LOCAL_API_ORIGIN,
  );

  return {
    resolvedLocalApiOrigin: resolved,
    sessionToken,
    sessionConfigPath: resolveSessionConfigPath(options.appDataRoot),
  };
}

function classifyFetchFailure(error, resolvedOrigin) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const code = error && typeof error === "object" ? error.code : null;

  if (
    lower.includes("econnrefused") ||
    lower.includes("connection refused") ||
    code === "ECONNREFUSED"
  ) {
    return {
      category: "connection_refused",
      fallbackReason: "connection_refused",
      message: `Local API connection refused at ${resolvedOrigin}.`,
    };
  }

  if (lower.includes("fetch failed") || lower.includes("network")) {
    return {
      category: "local_api_unreachable",
      fallbackReason: "local_api_unreachable",
      message: `Local API at ${resolvedOrigin} is unreachable.`,
    };
  }

  return {
    category: "directory_request_failed",
    fallbackReason: "directory_request_failed",
    message,
  };
}

export async function probeLocalAccessManagementApi(options = {}) {
  const { resolvedLocalApiOrigin, sessionToken } = resolveLocalApiOrigin(options);
  const headers = sessionToken
    ? { "x-neud-local-session": sessionToken }
    : undefined;

  const result = {
    resolvedLocalApiOrigin,
    localApiReachable: false,
    healthHttpStatus: null,
    healthOk: false,
    directoryRouteRegistered: false,
    diagnosticsRouteRegistered: false,
    directoryHttpStatus: null,
    directoryResponseParsed: false,
    directoryResponseCode: null,
    directoryProbeCategory: null,
    cloudDirectoryRequestAttemptedAt: new Date().toISOString(),
    cloudDirectoryRequestResult: "not_attempted",
    cloudDirectoryHttpStatus: null,
    actualFallbackReason: null,
    localApiError: null,
  };

  if (!sessionToken) {
    result.directoryProbeCategory = "session_token_missing";
    result.actualFallbackReason = "local_api_unreachable";
    result.localApiError = "Local API session token unavailable.";
    return result;
  }

  try {
    const healthResponse = await fetch(`${resolvedLocalApiOrigin}/api/health`, {
      headers,
      cache: "no-store",
    });
    result.healthHttpStatus = healthResponse.status;
    const healthPayload = await healthResponse.json().catch(() => ({}));
    result.localApiReachable = healthResponse.ok;
    result.healthOk = healthPayload.ok === true;
    result.resolvedLocalApiOrigin =
      normalizeLocalApiOrigin(healthPayload.resolvedLocalApiOrigin) ??
      resolvedLocalApiOrigin;
    result.directoryRouteRegistered = healthPayload.directoryRouteRegistered === true;
    result.diagnosticsRouteRegistered = healthPayload.diagnosticsRouteRegistered === true;
  } catch (error) {
    const classified = classifyFetchFailure(error, resolvedLocalApiOrigin);
    result.directoryProbeCategory = classified.category;
    result.actualFallbackReason = classified.fallbackReason;
    result.localApiError = classified.message;
    result.cloudDirectoryRequestResult = "failure";
    return result;
  }

  try {
    const diagnosticsResponse = await fetch(
      `${result.resolvedLocalApiOrigin}/api/access/cloud/directory/diagnostics`,
      { headers, cache: "no-store" },
    );
    result.diagnosticsRouteRegistered = diagnosticsResponse.status !== 404;
    const diagnosticsPayload = await diagnosticsResponse.json().catch(() => ({}));
    if (diagnosticsResponse.ok) {
      Object.assign(result, diagnosticsPayload);
    }
  } catch (error) {
    const classified = classifyFetchFailure(error, result.resolvedLocalApiOrigin);
    result.directoryProbeCategory = classified.category;
    result.actualFallbackReason = classified.fallbackReason;
    result.localApiError = classified.message;
    result.cloudDirectoryRequestResult = "failure";
    return result;
  }

  try {
    const directoryResponse = await fetch(
      `${result.resolvedLocalApiOrigin}/api/access/cloud/directory?forceRefresh=1`,
      { headers, cache: "no-store" },
    );
    result.directoryHttpStatus = directoryResponse.status;
    result.cloudDirectoryHttpStatus = directoryResponse.status;
    result.directoryRouteRegistered = directoryResponse.status !== 404;

    if (directoryResponse.status === 404) {
      result.directoryProbeCategory = "route_not_found";
      result.actualFallbackReason = "route_not_found";
      result.cloudDirectoryRequestResult = "failure";
      return result;
    }

    const directoryPayload = await directoryResponse.json().catch(() => null);
    result.directoryResponseParsed = directoryPayload != null && typeof directoryPayload === "object";
    result.directoryResponseCode =
      directoryPayload && typeof directoryPayload === "object"
        ? directoryPayload.fallbackReason ?? (directoryPayload.ok ? "none" : "directory_request_failed")
        : null;

    if (!result.directoryResponseParsed) {
      result.directoryProbeCategory = "malformed_response";
      result.actualFallbackReason = "malformed_response";
      result.cloudDirectoryRequestResult = "failure";
      return result;
    }

    result.cloudDirectoryRequestResult = directoryPayload.ok ? "success" : "failure";
    result.actualFallbackReason =
      directoryPayload.fallbackReason ??
      result.actualFallbackReason ??
      (directoryPayload.ok ? "none" : "directory_request_failed");
    return result;
  } catch (error) {
    const classified = classifyFetchFailure(error, result.resolvedLocalApiOrigin);
    result.directoryProbeCategory = classified.category;
    result.actualFallbackReason = classified.fallbackReason;
    result.localApiError = classified.message;
    result.cloudDirectoryRequestResult = "failure";
    return result;
  }
}
