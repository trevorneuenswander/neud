import {
  classifyLocalFetchFailure,
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

  try {
    const response = await fetch(`${baseUrl}${path}`, {
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

    if (response.status === 404) {
      throw new LocalApiError("Access management service route was not found.", 404);
    }

    if (!response.ok) {
      const code = normalizeLocalApiErrorCode(payload.code);
      throw new LocalApiError(
        payload.error ?? `Local API request failed (${response.status}).`,
        response.status,
        code,
      );
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
    throw new LocalApiError(classified.message, 503);
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

export async function localListProjects(query?: string) {
  const suffix = query?.trim()
    ? `?q=${encodeURIComponent(query.trim())}`
    : "";
  return localFetch<{
    projects: Array<{ slug?: string | null } & Record<string, unknown>>;
    meta?: unknown;
  }>(`/api/projects${suffix}`);
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
}) {
  return localFetch<{ project: unknown }>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
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
  code: string | undefined,
): LocalApiErrorCode | undefined {
  if (!code) {
    return undefined;
  }

  if (
    code === LOCAL_API_ERROR_CODES.AUTH_REQUIRED ||
    code === LOCAL_API_ERROR_CODES.FORBIDDEN ||
    code === LOCAL_API_ERROR_CODES.PROJECT_NOT_FOUND ||
    code === LOCAL_API_ERROR_CODES.LOCAL_IDENTITY_UNAVAILABLE ||
    code === LOCAL_API_ERROR_CODES.ENGINE_INITIALIZATION_FAILED
  ) {
    return code;
  }

  return undefined;
}
