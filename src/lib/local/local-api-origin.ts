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
  | "malformed_response"
  | "timeout"
  | "directory_request_failed";

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
      message: `Access management service could not be reached at ${baseUrl}.`,
    };
  }

  if (lower.includes("fetch failed") || lower.includes("network")) {
    return {
      category: "local_api_unreachable",
      message: `Access management service could not be reached at ${baseUrl}.`,
    };
  }

  return {
    category: "directory_request_failed",
    message,
  };
}
