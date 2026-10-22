import {
  classifyLocalFetchFailure,
  formatLocalApiHttpError,
  isDesktopRenderer,
  resolveDesktopLocalApiConfig,
  resolveLocalApiOriginFromEnv,
} from "@/lib/local/local-api-origin";
import {
  LOCAL_API_ERROR_CODES,
  LocalApiError,
  type LocalApiErrorCode,
} from "@/lib/local/errors";

type LocalApiPayload = {
  error?: string;
  code?: string;
};

const LOCAL_API_SESSION_HEADER = "x-neud-local-session";
const DEFAULT_LOCAL_FETCH_TIMEOUT_MS = 5_000;

function isZoomCredentialPath(path: string): boolean {
  return (
    path === "/api/integrations/zoom/app-credentials" ||
    path === "/api/integrations/zoom"
  );
}

function logZoomCredentialRequest(input: {
  method: string;
  path: string;
  url: string;
  status: number | null;
  code?: string | null;
  reachedLocalApi: boolean;
  error?: string | null;
}) {
  console.info("[neud-zoom-cred] renderer request", {
    method: input.method,
    path: input.path,
    url: input.url,
    status: input.status,
    code: input.code ?? null,
    reachedLocalApi: input.reachedLocalApi,
    error: input.error ?? null,
    // Never log request bodies / secrets.
  });
}

const engineInitializationPromises = new Map<string, Promise<void>>();

async function resolveLocalApiRequestContext(): Promise<{
  baseUrl: string;
  sessionToken: string | null;
}> {
  if (isDesktopRenderer()) {
    return resolveDesktopLocalApiConfig();
  }

  return {
    baseUrl: resolveLocalApiOriginFromEnv(),
    sessionToken: getLocalApiSessionToken(),
  };
}

export async function localFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const { baseUrl, sessionToken } = await resolveLocalApiRequestContext();
  const timeoutMs = init?.timeoutMs ?? DEFAULT_LOCAL_FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const method = (init?.method ?? "GET").toUpperCase();
  const requestUrl = `${baseUrl}${path}`;
  const zoomCredPath = isZoomCredentialPath(path);

  try {
    const response = await fetch(requestUrl, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken
          ? {
              [LOCAL_API_SESSION_HEADER]: sessionToken,
            }
          : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as T & LocalApiPayload;

    if (response.status === 504 && payload.code === "IDENTITY_RESOLUTION_TIMEOUT") {
      return payload as T;
    }

    if (!response.ok) {
      const formatted = formatLocalApiHttpError({
        status: response.status,
        path,
        error: payload.error,
        code: payload.code,
      });
      if (zoomCredPath) {
        logZoomCredentialRequest({
          method,
          path,
          url: requestUrl,
          status: response.status,
          code: formatted.code ?? payload.code,
          reachedLocalApi: true,
          error: formatted.message,
        });
      }
      throw new LocalApiError(
        formatted.message,
        response.status,
        normalizeLocalApiErrorCode(formatted.code ?? payload.code),
      );
    }

    if (zoomCredPath && method !== "GET") {
      logZoomCredentialRequest({
        method,
        path,
        url: requestUrl,
        status: response.status,
        reachedLocalApi: true,
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof LocalApiError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Dynamic server usage")) {
      throw error;
    }

    const classified = classifyLocalFetchFailure(error, baseUrl);
    if (zoomCredPath) {
      logZoomCredentialRequest({
        method,
        path,
        url: requestUrl,
        status: null,
        code: LOCAL_API_ERROR_CODES.LOCAL_API_UNREACHABLE,
        reachedLocalApi: false,
        error: classified.message,
      });
    }
    throw new LocalApiError(
      classified.message,
      503,
      LOCAL_API_ERROR_CODES.LOCAL_API_UNREACHABLE,
    );
  } finally {
    clearTimeout(timer);
  }
}

export function getLocalApiSessionToken(): string | null {
  const fromEnv = process.env.NEUD_LOCAL_API_SESSION?.trim();
  return fromEnv || null;
}

export async function ensureProjectEnginesInitializedOnce(
  projectId: string,
  initialize: () => Promise<void>,
): Promise<void> {
  const existing = engineInitializationPromises.get(projectId);
  if (existing) {
    return existing;
  }

  const promise = initialize().finally(() => {
    engineInitializationPromises.delete(projectId);
  });
  engineInitializationPromises.set(projectId, promise);
  return promise;
}

export async function localListProjects(
  query?: string,
  options?: { scope?: "all" | "installed" | "directory" },
) {
  const params = new URLSearchParams();
  const trimmed = query?.trim();
  if (trimmed) {
    params.set("q", trimmed);
  }
  params.set("scope", options?.scope ?? "directory");
  const suffix = `?${params.toString()}`;
  return localFetch<{
    projects: Array<{ slug?: string | null } & Record<string, unknown>>;
    meta?: unknown;
  }>(`/api/projects${suffix}`);
}

export async function localDownloadProjectPackage(slug: string) {
  return localFetch<{ ok: boolean; install?: unknown; error?: string }>(
    "/api/project-packages/download",
    {
      method: "POST",
      body: JSON.stringify({ slug }),
    },
  );
}

export async function localUpdateProjectPackage(slug: string) {
  return localFetch<{ ok: boolean; install?: unknown; error?: string }>(
    "/api/project-packages/update",
    {
      method: "POST",
      body: JSON.stringify({ slug }),
    },
  );
}

export async function localRemoveProjectPackage(slug: string) {
  return localFetch<{ ok: boolean; retainedData?: boolean; error?: string }>(
    "/api/project-packages/remove",
    {
      method: "POST",
      body: JSON.stringify({ slug }),
    },
  );
}

/** Force-refresh cloud project directory + package metadata. Does not download/install. */
export async function localRefreshProjectDirectory() {
  return localFetch<{
    ok: boolean;
    projects?: Array<Record<string, unknown>>;
    error?: string;
  }>("/api/project-packages/refresh-directory", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function localSlugExists(slug: string) {
  return localFetch<{ exists: boolean }>(
    `/api/projects/slug-exists/${encodeURIComponent(slug)}`,
  );
}

export async function localVerifyConnected() {
  const payload = await localFetch<{ ok?: boolean }>("/api/health");
  return payload.ok === true;
}

export async function localCreateProject(input: {
  name: string;
  slug: string;
  projectType: string;
  description?: string | null;
  theme?: string;
  icon?: string;
  capabilities?: string[];
  teamIds?: string[];
}) {
  return localFetch<{ project: unknown }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function localGetProjectCreateMeta() {
  return localFetch<{ teams: Array<{ id: string; name: string }> }>(
    "/api/projects/create-meta",
  );
}

export async function localGetProjectCapabilities(projectSlug: string) {
  return localFetch<{ capabilities: string[] }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/capabilities`,
  );
}

export async function localUpdateProjectCapabilities(
  projectSlug: string,
  capabilities: string[],
) {
  return localFetch<{ project: unknown; capabilities: string[] }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/capabilities`,
    {
      method: "PUT",
      body: JSON.stringify({ capabilities }),
    },
  );
}

export async function localUpdateProjectSettings(
  projectSlug: string,
  input: { name: string; isActive: boolean; description?: string | null },
) {
  return localFetch<{ project: unknown }>(
    `/api/projects/${encodeURIComponent(projectSlug)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: input.name,
        isActive: input.isActive,
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
      }),
    },
  );
}

export async function localGetProjectEngines(projectSlug: string) {
  return localFetch<{ engines: unknown[] }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/data-sources`,
  );
}

export async function localGetEngineDetail(engineId: string) {
  return localFetch<Record<string, unknown>>(
    `/api/data-sources/${encodeURIComponent(engineId)}/detail`,
  );
}

export async function localUpdateDesiredState(
  engineId: string,
  desiredState: "running" | "stopped",
) {
  return localFetch<{ ok: boolean }>(
    `/api/data-sources/${encodeURIComponent(engineId)}/desired-state`,
    {
      method: "PATCH",
      body: JSON.stringify({ desiredState }),
    },
  );
}

export async function localQueueRunOnce(engineId: string) {
  return localFetch<{ ok: boolean }>(
    `/api/data-sources/${encodeURIComponent(engineId)}/run-once`,
    { method: "POST" },
  );
}

export async function localSetExecutionMode(
  engineId: string,
  executionMode: "local-desktop" | "remote-worker",
) {
  return localFetch<{ ok: boolean }>(
    `/api/data-sources/${encodeURIComponent(engineId)}/execution-mode`,
    {
      method: "PATCH",
      body: JSON.stringify({ executionMode }),
    },
  );
}

export async function localUpdateScraperSettings(
  engineId: string,
  input: {
    pollIntervalMs: number;
    detailsTtlMs: number;
    maxDetailChecksPerPoll: number;
    headless?: boolean;
  },
) {
  return localFetch<{ ok: boolean }>(
    `/api/data-sources/${encodeURIComponent(engineId)}/settings`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function localSaveScraperSource(
  engineId: string,
  input: Record<string, unknown>,
) {
  return localFetch<{ source: unknown }>(
    `/api/data-sources/${encodeURIComponent(engineId)}/sources`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function localToggleScraperSource(
  engineId: string,
  sourceId: string,
  enabled: boolean,
) {
  return localFetch<{ ok: boolean }>(
    `/api/data-sources/${encodeURIComponent(engineId)}/sources/${encodeURIComponent(sourceId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    },
  );
}

export async function localRemoveScraperSource(engineId: string, sourceId: string) {
  return localFetch<{ ok: boolean }>(
    `/api/data-sources/${encodeURIComponent(engineId)}/sources/${encodeURIComponent(sourceId)}`,
    { method: "DELETE" },
  );
}

function normalizeLocalApiErrorCode(
  code: string | undefined | null,
): LocalApiErrorCode | undefined {
  if (!code) {
    return undefined;
  }

  const known = Object.values(LOCAL_API_ERROR_CODES) as string[];
  if (known.includes(code)) {
    return code as LocalApiErrorCode;
  }

  return undefined;
}
