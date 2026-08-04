import { getLocalApiBaseUrl } from "@/lib/local/mode";

async function localFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getLocalApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message ?? payload.error ?? `Local API request failed (${response.status}).`);
  }

  return payload;
}

export async function localSaveBagScraperUrls(
  engineId: string,
  input: {
    vehicles?: string;
    login?: string;
    auctionDisplay?: string;
  },
) {
  return localFetch<{ ok: boolean }>(
    `/api/data-sources/${encodeURIComponent(engineId)}/bag-sources`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
}

export async function localListBagSources(engineId: string) {
  return localFetch<{ sources: Array<Record<string, unknown>> }>(
    `/api/data-sources/${encodeURIComponent(engineId)}/sources`,
  );
}

export async function localSaveBagSource(
  engineId: string,
  input: Record<string, unknown>,
) {
  return localFetch<{ source: Record<string, unknown> }>(
    `/api/data-sources/${encodeURIComponent(engineId)}/sources`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function localPatchBagSource(
  engineId: string,
  sourceId: string,
  input: Record<string, unknown>,
) {
  return localFetch<{ source?: Record<string, unknown>; ok?: boolean }>(
    `/api/data-sources/${encodeURIComponent(engineId)}/sources/${encodeURIComponent(sourceId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function localDeleteBagSource(engineId: string, sourceId: string) {
  return localFetch<{ ok: boolean }>(
    `/api/data-sources/${encodeURIComponent(engineId)}/sources/${encodeURIComponent(sourceId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function localResetBagSource(engineId: string, sourceId: string) {
  return localFetch<{ source: Record<string, unknown> }>(
    `/api/data-sources/${encodeURIComponent(engineId)}/sources/${encodeURIComponent(sourceId)}/reset`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function localReorderBagSources(
  engineId: string,
  orderedSourceIds: string[],
) {
  return localFetch<{ sources: Array<Record<string, unknown>> }>(
    `/api/data-sources/${encodeURIComponent(engineId)}/sources/reorder`,
    {
      method: "POST",
      body: JSON.stringify({ orderedSourceIds }),
    },
  );
}

export async function localDeleteProject(
  projectId: string,
  confirmationName: string,
) {
  return localFetch<{
    ok: boolean;
    deletedProjectId?: string;
    code?: string;
    message?: string;
  }>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
    body: JSON.stringify({ confirmationName }),
  });
}
