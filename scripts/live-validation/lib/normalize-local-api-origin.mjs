export const DEFAULT_LOCAL_API_ORIGIN = "http://127.0.0.1:8070";

function stripOuterQuotePair(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if (
      (first === '"' && last === '"') ||
      (first === "'" && last === "'")
    ) {
      return value.slice(1, -1).trim();
    }
  }
  return value;
}

function decodeJsonStringCandidate(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") {
        return parsed.trim();
      }
    } catch {
      return stripOuterQuotePair(trimmed);
    }
  }

  return trimmed;
}

function validateOrigin(candidate) {
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (!url.hostname) {
      return null;
    }
    if (url.username || url.password) {
      return null;
    }
    if (url.pathname !== "/" && url.pathname !== "") {
      return null;
    }
    if (url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function normalizeLocalApiOrigin(value, options) {
  if (value == null) {
    return options?.fallback ?? null;
  }

  let candidate = typeof value === "string" ? value : String(value);
  candidate = decodeJsonStringCandidate(candidate);
  candidate = candidate.replace(/\/$/, "");

  const validated = validateOrigin(candidate);
  if (validated) {
    return validated;
  }

  if (options?.fallback !== undefined) {
    return options.fallback;
  }

  return null;
}

export function resolveLocalApiOriginFromCandidates(candidates, fallback = DEFAULT_LOCAL_API_ORIGIN) {
  for (const candidate of candidates) {
    const normalized = normalizeLocalApiOrigin(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return fallback;
}

export function parseAppSettingValue(raw) {
  if (raw == null) {
    return null;
  }

  if (typeof raw !== "string") {
    return raw;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
