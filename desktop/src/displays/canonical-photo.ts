export type CanonicalPhoto = {
  localUrl?: string;
  remoteUrl?: string;
  originalUrl?: string;
  cloudAssetUrl?: string;
  storageObjectId?: string;
  filename?: string;
};

export type PublishedCanonicalPhoto = {
  remoteUrl?: string;
  originalUrl?: string;
  cloudAssetUrl?: string;
  storageObjectId?: string;
  filename?: string;
};

export type CanonicalPhotoInput = string | CanonicalPhoto;

const PUBLISHED_PHOTO_KEYS = new Set([
  "remoteUrl",
  "originalUrl",
  "cloudAssetUrl",
  "storageObjectId",
  "filename",
]);

const SECRET_KEY_PATTERN =
  /(password|passwd|secret|token|cookie|session|authorization|credential|service[_-]?role|api[_-]?key|refresh[_-]?token|access[_-]?token|email|phone|contact)/i;

const LOCAL_HOST_PATTERN = /^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost)(?::\d+)?/i;
const FILE_SCHEME_PATTERN = /^file:/i;
const WINDOWS_PATH_PATTERN = /^[a-zA-Z]:\\|^\\\\/;

function trimString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function stripCredentials(url: string): string {
  return url.replace(/\/\/[^/@]+@[^/]+\//g, "//");
}

export function isLocalOnlyPhotoUrl(url: string): boolean {
  const trimmed = stripCredentials(url.trim());
  if (!trimmed) {
    return false;
  }
  if (FILE_SCHEME_PATTERN.test(trimmed) || WINDOWS_PATH_PATTERN.test(trimmed)) {
    return true;
  }
  if (LOCAL_HOST_PATTERN.test(trimmed)) {
    return true;
  }
  if (trimmed.includes("/api/offline-assets/")) {
    return true;
  }
  if (/^photos\//i.test(trimmed) || /^images\//i.test(trimmed)) {
    return true;
  }
  return false;
}

export function isHostedAccessiblePhotoUrl(url: string): boolean {
  const trimmed = stripCredentials(url.trim());
  if (!trimmed) {
    return false;
  }
  if (!/^https:\/\//i.test(trimmed)) {
    return false;
  }
  return !isLocalOnlyPhotoUrl(trimmed);
}

export function isLocalDisplayPhotoUrl(url: string): boolean {
  const trimmed = stripCredentials(url.trim());
  if (!trimmed) {
    return false;
  }
  if (isLocalOnlyPhotoUrl(trimmed)) {
    return true;
  }
  return /^https?:\/\//i.test(trimmed);
}

export function normalizeCanonicalPhotoInput(
  entry: CanonicalPhotoInput,
): CanonicalPhoto | null {
  if (typeof entry === "string") {
    const url = trimString(entry);
    if (!url) {
      return null;
    }
    if (isLocalOnlyPhotoUrl(url)) {
      return { localUrl: url };
    }
    if (isHostedAccessiblePhotoUrl(url)) {
      return { remoteUrl: url, originalUrl: url };
    }
    return null;
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const localUrl = trimString(entry.localUrl);
  const remoteUrl = trimString(entry.remoteUrl ?? entry.originalUrl);
  const originalUrl = trimString(entry.originalUrl ?? entry.remoteUrl);
  const filename = trimString(entry.filename);
  const cloudAssetUrl = trimString(entry.cloudAssetUrl);
  const storageObjectId = trimString(entry.storageObjectId);

  const photo: CanonicalPhoto = {};
  if (localUrl && isLocalDisplayPhotoUrl(localUrl)) {
    photo.localUrl = localUrl;
  }
  if (remoteUrl && isHostedAccessiblePhotoUrl(remoteUrl)) {
    photo.remoteUrl = remoteUrl;
  }
  if (originalUrl && isHostedAccessiblePhotoUrl(originalUrl)) {
    photo.originalUrl = originalUrl;
  }
  if (cloudAssetUrl && isHostedAccessiblePhotoUrl(cloudAssetUrl)) {
    photo.cloudAssetUrl = cloudAssetUrl;
  }
  if (storageObjectId && /^[0-9a-f-]{36}$/i.test(storageObjectId)) {
    photo.storageObjectId = storageObjectId;
  }
  if (filename) {
    photo.filename = filename;
  }

  return Object.keys(photo).length > 0 ? photo : null;
}

function sanitizePublishedUrl(value: unknown): string | null {
  const url = trimString(value);
  if (!url) {
    return null;
  }
  if (isLocalOnlyPhotoUrl(url)) {
    return null;
  }
  if (FILE_SCHEME_PATTERN.test(url) || WINDOWS_PATH_PATTERN.test(url)) {
    return null;
  }
  if (!/^https:\/\//i.test(url)) {
    return null;
  }
  return stripCredentials(url);
}

function sanitizePublishedFilename(value: unknown): string | null {
  const filename = trimString(value);
  if (!filename) {
    return null;
  }
  if (SECRET_KEY_PATTERN.test(filename)) {
    return null;
  }
  if (FILE_SCHEME_PATTERN.test(filename) || WINDOWS_PATH_PATTERN.test(filename)) {
    return null;
  }
  if (filename.includes("/") || filename.includes("\\")) {
    return null;
  }
  return filename;
}

function sanitizeStorageObjectId(value: unknown): string | null {
  const id = trimString(value);
  if (!id) {
    return null;
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return null;
  }
  return id;
}

/** Sanitizes one photo for cloud canonical publication (hosted-safe fields only). */
export function sanitizeCanonicalPhoto(entry: unknown): PublishedCanonicalPhoto | string | null {
  if (typeof entry === "string") {
    return sanitizePublishedUrl(entry);
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!PUBLISHED_PHOTO_KEYS.has(key) && key !== "localUrl" && key !== "displayUrl") {
      continue;
    }
    if (SECRET_KEY_PATTERN.test(key)) {
      return null;
    }
  }

  const remoteUrl = sanitizePublishedUrl(record.remoteUrl ?? record.originalUrl);
  const originalUrl = sanitizePublishedUrl(record.originalUrl ?? record.remoteUrl);
  const cloudAssetUrl = sanitizePublishedUrl(record.cloudAssetUrl);
  const storageObjectId = sanitizeStorageObjectId(record.storageObjectId);
  const filename = sanitizePublishedFilename(record.filename);

  const published: PublishedCanonicalPhoto = {};
  if (remoteUrl) {
    published.remoteUrl = remoteUrl;
  }
  if (originalUrl) {
    published.originalUrl = originalUrl;
  }
  if (cloudAssetUrl) {
    published.cloudAssetUrl = cloudAssetUrl;
  }
  if (storageObjectId) {
    published.storageObjectId = storageObjectId;
  }
  if (filename) {
    published.filename = filename;
  }

  return Object.keys(published).length > 0 ? published : null;
}

/** Preserves photo order while removing unsafe/local-only publish fields. */
export function sanitizeCanonicalPhotos(photos: unknown): Array<PublishedCanonicalPhoto | string> {
  if (!Array.isArray(photos)) {
    return [];
  }

  const ordered: Array<PublishedCanonicalPhoto | string> = [];
  const seen = new Set<string>();

  for (const entry of photos) {
    const sanitized = sanitizeCanonicalPhoto(entry);
    if (!sanitized) {
      continue;
    }
    const key =
      typeof sanitized === "string"
        ? sanitized
        : [
            sanitized.remoteUrl ?? "",
            sanitized.originalUrl ?? "",
            sanitized.cloudAssetUrl ?? "",
            sanitized.storageObjectId ?? "",
            sanitized.filename ?? "",
          ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    ordered.push(sanitized);
  }

  return ordered;
}

/** Desktop display resolution preference: local → cloud asset → remote. */
export function resolveDesktopPhotoUrl(entry: CanonicalPhotoInput): string | null {
  const normalized = normalizeCanonicalPhotoInput(entry);
  if (!normalized) {
    return null;
  }
  if (typeof normalized === "string") {
    return isLocalDisplayPhotoUrl(normalized) ? stripCredentials(normalized) : null;
  }
  const url =
    (normalized.localUrl && isLocalDisplayPhotoUrl(normalized.localUrl)
      ? normalized.localUrl
      : null) ??
    (normalized.cloudAssetUrl && isHostedAccessiblePhotoUrl(normalized.cloudAssetUrl)
      ? normalized.cloudAssetUrl
      : null) ??
    (normalized.remoteUrl && isHostedAccessiblePhotoUrl(normalized.remoteUrl)
      ? normalized.remoteUrl
      : null) ??
    (normalized.originalUrl && isHostedAccessiblePhotoUrl(normalized.originalUrl)
      ? normalized.originalUrl
      : null);
  return url ? stripCredentials(url) : null;
}

/** Hosted display resolution preference: cloud asset → remote/original. */
export function resolveHostedPhotoUrl(entry: CanonicalPhotoInput): string | null {
  const sanitized = sanitizeCanonicalPhoto(entry);
  if (!sanitized) {
    return null;
  }
  if (typeof sanitized === "string") {
    return sanitized;
  }
  return sanitized.cloudAssetUrl ?? sanitized.remoteUrl ?? sanitized.originalUrl ?? null;
}

export function normalizeCanonicalPhotoList(
  photos: unknown,
): CanonicalPhotoInput[] {
  if (!Array.isArray(photos)) {
    return [];
  }

  const ordered: CanonicalPhotoInput[] = [];
  const seen = new Set<string>();

  for (const entry of photos) {
    const normalized =
      typeof entry === "string" || (entry && typeof entry === "object")
        ? normalizeCanonicalPhotoInput(entry as CanonicalPhotoInput)
        : null;
    if (!normalized) {
      continue;
    }

    const key =
      typeof normalized === "object"
        ? [
            normalized.localUrl ?? "",
            normalized.remoteUrl ?? "",
            normalized.originalUrl ?? "",
            normalized.cloudAssetUrl ?? "",
            normalized.storageObjectId ?? "",
            normalized.filename ?? "",
          ].join("|")
        : normalized;

    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    ordered.push(normalized);
  }

  return ordered;
}

export function resolvePhotoUrlsForLocalDisplay(photos: unknown): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const entry of normalizeCanonicalPhotoList(photos)) {
    const url = resolveDesktopPhotoUrl(entry);
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    ordered.push(url);
  }

  return ordered;
}

export function resolvePhotoUrlsForHostedDisplay(photos: unknown): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const entry of Array.isArray(photos) ? photos : []) {
    const url = resolveHostedPhotoUrl(entry as CanonicalPhotoInput);
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    ordered.push(url);
  }

  return ordered;
}

export function summarizeCanonicalPhotoSources(photos: unknown): {
  localCount: number;
  remoteCount: number;
  cloudAssetCount: number;
  mixedCount: number;
  rejectedLocalOnlyCount: number;
} {
  let localCount = 0;
  let remoteCount = 0;
  let cloudAssetCount = 0;
  let mixedCount = 0;
  let rejectedLocalOnlyCount = 0;

  for (const entry of normalizeCanonicalPhotoList(photos)) {
    if (typeof entry === "string") {
      if (isHostedAccessiblePhotoUrl(entry)) {
        remoteCount += 1;
      } else if (isLocalOnlyPhotoUrl(entry)) {
        localCount += 1;
        rejectedLocalOnlyCount += 1;
      }
      continue;
    }

    const hasLocal = Boolean(entry.localUrl);
    const hasRemote = Boolean(entry.remoteUrl || entry.originalUrl);
    const hasCloud = Boolean(entry.cloudAssetUrl || entry.storageObjectId);
    if (hasCloud) {
      cloudAssetCount += 1;
    }
    if (hasLocal && (hasRemote || hasCloud)) {
      mixedCount += 1;
    } else if (hasLocal) {
      localCount += 1;
      rejectedLocalOnlyCount += 1;
    } else if (hasRemote) {
      remoteCount += 1;
    }
  }

  return { localCount, remoteCount, cloudAssetCount, mixedCount, rejectedLocalOnlyCount };
}
