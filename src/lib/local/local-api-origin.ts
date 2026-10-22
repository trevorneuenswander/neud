import { readNeudEnv } from "@/lib/env/neud-env";
import {
  DEFAULT_LOCAL_API_ORIGIN,
  normalizeLocalApiOrigin,
  resolveLocalApiOriginFromCandidates,
} from "@/lib/local/normalize-local-api-origin";

export { DEFAULT_LOCAL_API_ORIGIN, normalizeLocalApiOrigin };

export type DesktopLocalApiConfig = {
  baseUrl: string;
  sessionToken: string | null;
};

let cachedDesktopConfig: DesktopLocalApiConfig | null = null;
let desktopConfigPromise: Promise<DesktopLocalApiConfig> | null = null;

export function resolveLocalApiOriginFromEnv(): string {
  return resolveLocalApiOriginFromCandidates([
    readNeudEnv("NEUD_LOCAL_API_URL"),
    readNeudEnv("NEXT_PUBLIC_NEUD_LOCAL_API_URL"),
  ]);
}

export function isDesktopRenderer(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.neudDesktop?.app?.isDesktop() === true;
  } catch {
    return false;
  }
}

export async function resolveDesktopLocalApiConfig(): Promise<DesktopLocalApiConfig> {
  if (cachedDesktopConfig) {
    return cachedDesktopConfig;
  }

  if (!desktopConfigPromise) {
    desktopConfigPromise = loadDesktopLocalApiConfig().finally(() => {
      desktopConfigPromise = null;
    });
  }

  return desktopConfigPromise;
}

async function loadDesktopLocalApiConfig(): Promise<DesktopLocalApiConfig> {
  if (typeof window !== "undefined") {
    try {
      const getApiConfig = window.neudDesktop?.local?.getApiConfig;
      if (typeof getApiConfig === "function") {
        const config = await getApiConfig();
        const baseUrl = normalizeLocalApiOrigin(config?.baseUrl);
        if (baseUrl) {
          cachedDesktopConfig = {
            baseUrl,
            sessionToken: config.sessionToken?.trim() || null,
          };
          return cachedDesktopConfig;
        }
      }
    } catch {
      // fall through to env defaults
    }
  }

  cachedDesktopConfig = {
    baseUrl: resolveLocalApiOriginFromEnv(),
    sessionToken: readNeudEnv("NEUD_LOCAL_API_SESSION") ?? null,
  };
  return cachedDesktopConfig;
}

export function resetDesktopLocalApiConfigCache() {
  cachedDesktopConfig = null;
  desktopConfigPromise = null;
}

export type LocalFetchFailureCategory =
  | "connection_refused"
  | "local_api_unreachable"
  | "route_not_found"
  | "http_client_error"
  | "http_server_error"
  | "malformed_response"
  | "timeout"
  | "directory_request_failed";

/**
 * Classify *network-level* fetch failures only.
 * Do not use for HTTP responses that already arrived (4xx/5xx) — those must
 * surface their status/body, not "Local API could not be reached".
 */
export function classifyLocalFetchFailure(
  error: unknown,
  baseUrl: string,
): { category: LocalFetchFailureCategory; message: string } {
  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      category: "timeout",
      message: "Local API request timed out.",
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  if (
    lower.includes("econnrefused") ||
    lower.includes("connection refused") ||
    code === "ECONNREFUSED"
  ) {
    return {
      category: "connection_refused",
      message: `Local API connection refused at ${baseUrl}.`,
    };
  }

  // Chromium uses "Failed to fetch"; Node often uses "fetch failed".
  // This can also mean CORS preflight rejection — not necessarily that the
  // process is down. Prefer a network-level message only when fetch never
  // produced an HTTP response.
  if (
    lower.includes("fetch failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    (lower.includes("network") && !lower.includes("network_error"))
  ) {
    return {
      category: "local_api_unreachable",
      message: `Local API could not be reached at ${baseUrl}. Check that NEUD desktop local services are running.`,
    };
  }

  return {
    category: "directory_request_failed",
    message,
  };
}

export function formatLocalApiHttpError(input: {
  status: number;
  path: string;
  error?: string | null;
  code?: string | null;
}): { category: LocalFetchFailureCategory; message: string; code?: string } {
  const { status, path, error, code } = input;
  if (status === 404) {
    return {
      category: "route_not_found",
      message:
        error?.trim() ||
        `Local API route was not found (${path}).`,
      code: code ?? "ROUTE_NOT_FOUND",
    };
  }
  if (status === 405) {
    return {
      category: "http_client_error",
      message: error?.trim() || `Local API method not allowed (${path}).`,
      code: code ?? "METHOD_NOT_ALLOWED",
    };
  }
  if (status >= 500) {
    return {
      category: "http_server_error",
      message:
        error?.trim() ||
        `Local API server error (${status}) for ${path}.`,
      code: code ?? undefined,
    };
  }
  if (status >= 400) {
    return {
      category: "http_client_error",
      message:
        error?.trim() ||
        `Local API request failed (${status}) for ${path}.`,
      code: code ?? undefined,
    };
  }
  return {
    category: "directory_request_failed",
    message: error?.trim() || `Local API request failed (${status}).`,
    code: code ?? undefined,
  };
}
