import type { SupabaseClient } from "@supabase/supabase-js";

export function buildHostedPhotoProxyUrl(input: {
  assetId: string;
  projectSlug: string;
  displaySlug: string;
  origin?: string;
}): string {
  const params = new URLSearchParams({
    projectSlug: input.projectSlug,
    displaySlug: input.displaySlug,
  });
  const path = `/api/hosted/photos/${encodeURIComponent(input.assetId)}?${params.toString()}`;
  return input.origin ? `${input.origin.replace(/\/$/, "")}${path}` : path;
}

export async function enrichHostedCanonicalPhotosWithProxy(input: {
  canonicalPayload: Record<string, unknown>;
  projectSlug: string;
  displaySlug: string;
  origin?: string;
}): Promise<Record<string, unknown>> {
  return walkPhotos(input.canonicalPayload, (entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }
    const record = entry as Record<string, unknown>;
    const storageObjectId =
      typeof record.storageObjectId === "string" ? record.storageObjectId.trim() : "";
    if (!storageObjectId) {
      return entry;
    }
    return {
      ...record,
      cloudAssetUrl: buildHostedPhotoProxyUrl({
        assetId: storageObjectId,
        projectSlug: input.projectSlug,
        displaySlug: input.displaySlug,
        origin: input.origin,
      }),
    };
  }) as Record<string, unknown>;
}

function walkPhotos(value: unknown, transform: (entry: unknown) => unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (entry && typeof entry === "object") {
        return transform(entry);
      }
      return entry;
    });
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === "photos" && Array.isArray(entry)) {
      output[key] = entry.map((photo) => transform(photo));
      continue;
    }
    output[key] = walkPhotos(entry, transform);
  }
  return output;
}

export async function resolveStorageObjectIdsViaProxy(input: {
  supabase: SupabaseClient;
  canonicalPayload: Record<string, unknown>;
  projectSlug: string;
  displaySlug: string;
  origin?: string;
}): Promise<{
  payload: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
}> {
  const payload = await enrichHostedCanonicalPhotosWithProxy({
    canonicalPayload: input.canonicalPayload,
    projectSlug: input.projectSlug,
    displaySlug: input.displaySlug,
    origin: input.origin,
  });

  let storageObjectResolveCount = 0;
  const countStorageIds = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry && typeof entry === "object" && (entry as { cloudAssetUrl?: string }).cloudAssetUrl) {
          storageObjectResolveCount += 1;
        }
      }
      return;
    }
    if (value && typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        countStorageIds(nested);
      }
    }
  };
  countStorageIds(payload);

  return {
    payload,
    diagnostics: {
      storageObjectResolveCount,
      firstResolutionMethod: storageObjectResolveCount > 0 ? "hosted_photo_proxy" : null,
    },
  };
}
