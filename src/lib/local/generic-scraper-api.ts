import { getLocalApiBaseUrl } from "@/lib/local/mode";
import type { GenericExtractionField, GenericLoginConfig } from "@/lib/data-engines/generic-scraper-types";

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
  };

  if (!response.ok) {
    throw new Error(payload.error ?? `Local API request failed (${response.status}).`);
  }

  return payload;
}

export async function localSaveGenericScraperConfig(
  engineId: string,
  input: {
    pageUrl: string;
    loginUrl?: string;
    login?: GenericLoginConfig;
    fields: GenericExtractionField[];
  },
) {
  return localFetch<{ ok: boolean }>(
    `/api/data-sources/${encodeURIComponent(engineId)}/generic-config`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
}

export async function localConvertGenericAdapter(
  engineId: string,
  options: { removeUntouchedBagUrls?: boolean } = {},
) {
  return localFetch<{
    ok: boolean;
    converted: boolean;
    removedBagSources: string[];
  }>(`/api/data-sources/${encodeURIComponent(engineId)}/convert-generic-adapter`, {
    method: "POST",
    body: JSON.stringify(options),
  });
}
