import { filterUsablePhotoUrls } from "../../displays/display-utils";
import {
  resolveDesktopPhotoUrl,
  type CanonicalPhotoInput,
} from "../../displays/canonical-photo";

export type LotPhotoOverrideEntry = {
  order?: string[];
  removed?: string[];
  added?: string[];
};

export type LotPhotoOverrides = Record<string, LotPhotoOverrideEntry>;

export function normalizeLotPhotoKey(lotNumber: string): string {
  return lotNumber.replace(/^lot\s+/i, "").trim();
}

function extractOfflineAssetPath(url: string): string | null {
  const match = url.match(/\/api\/offline-assets\/[^/]+\/(.+)$/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).replace(/\\/g, "/");
  } catch {
    return match[1].replace(/\\/g, "/");
  }
}

function photoUrlKey(url: string): string {
  const offlinePath = extractOfflineAssetPath(url);
  if (offlinePath) {
    return `local:${offlinePath}`;
  }
  return `url:${url}`;
}

export function parseLotPhotoOverrides(value: unknown): LotPhotoOverrides {
  if (!value || typeof value !== "object") return {};
  const parsed = value as LotPhotoOverrides;
  const result: LotPhotoOverrides = {};
  for (const [key, entry] of Object.entries(parsed)) {
    if (!entry || typeof entry !== "object") continue;
    result[key] = {
      order: Array.isArray(entry.order)
        ? entry.order.filter((url): url is string => typeof url === "string")
        : undefined,
      removed: Array.isArray(entry.removed)
        ? entry.removed.filter((url): url is string => typeof url === "string")
        : undefined,
      added: Array.isArray(entry.added)
        ? entry.added.filter((url): url is string => typeof url === "string")
        : undefined,
    };
  }
  return result;
}

export function applyLotPhotoOverrides<T extends { url: string }>(
  photos: T[],
  overrides: LotPhotoOverrides | null | undefined,
  lotNumber: string,
): T[] {
  const key = normalizeLotPhotoKey(lotNumber);
  const entry = overrides?.[key];
  if (!entry) return photos;

  const removed = new Set((entry.removed ?? []).map(photoUrlKey));
  let filtered = photos.filter((photo) => !removed.has(photoUrlKey(photo.url)));

  const existingKeys = new Set(filtered.map((photo) => photoUrlKey(photo.url)));
  const added = (entry.added ?? [])
    .filter((url) => url && !removed.has(photoUrlKey(url)))
    .filter((url) => {
      const canonical = photoUrlKey(url);
      if (existingKeys.has(canonical)) {
        return false;
      }
      existingKeys.add(canonical);
      return true;
    })
    .map((url) => ({ url }) as T);

  if (added.length > 0) {
    filtered = [...filtered, ...added];
  }

  if (entry.order && entry.order.length > 0) {
    const byUrl = new Map(filtered.map((photo) => [photoUrlKey(photo.url), photo]));
    const ordered: T[] = [];
    const seen = new Set<string>();
    for (const url of entry.order) {
      const canonical = photoUrlKey(url);
      const photo = byUrl.get(canonical);
      if (photo && !seen.has(canonical)) {
        ordered.push(photo);
        seen.add(canonical);
      }
    }
    for (const photo of filtered) {
      const canonical = photoUrlKey(photo.url);
      if (!seen.has(canonical)) {
        ordered.push(photo);
      }
    }
    filtered = ordered;
  }

  return filtered;
}

function canonicalEntryUrl(entry: CanonicalPhotoInput): string {
  if (typeof entry === "string") {
    return entry;
  }
  return resolveDesktopPhotoUrl(entry) ?? entry.localUrl ?? entry.remoteUrl ?? "";
}

export function applyLotPhotoOverridesToCanonicalPhotos(
  photos: CanonicalPhotoInput[],
  overrides: LotPhotoOverrides | null | undefined,
  lotNumber: string,
): CanonicalPhotoInput[] {
  const keyed = photos.map((entry) => ({ entry, url: canonicalEntryUrl(entry) }));
  const adjusted = applyLotPhotoOverrides(
    keyed.map((item) => ({ url: item.url, entry: item.entry })),
    overrides,
    lotNumber,
  );
  return adjusted.map((item) =>
    item.entry ?? (typeof item.url === "string" ? { localUrl: item.url } : item.url),
  );
}

export function applyUsablePhotoFilters(urls: string[]): string[] {
  return filterUsablePhotoUrls(urls);
}
