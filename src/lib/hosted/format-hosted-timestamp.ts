const SMALL_FUTURE_SKEW_MS = 90_000;

function parseUtcTimestamp(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed)
    ? trimmed
    : `${trimmed}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatHostedAbsoluteTimestamp(
  value: string | null | undefined,
  locale?: string,
): string | null {
  if (!value) {
    return null;
  }

  const parsed = parseUtcTimestamp(value);
  if (!parsed) {
    return null;
  }

  return parsed.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatHostedRelativeTimestamp(
  value: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (!value) {
    return "Never";
  }

  const parsed = parseUtcTimestamp(value);
  if (!parsed) {
    return "Unknown";
  }

  const deltaMs = nowMs - parsed.getTime();
  if (deltaMs < 0) {
    if (-deltaMs < SMALL_FUTURE_SKEW_MS) {
      return "Just now";
    }
    const absolute = formatHostedAbsoluteTimestamp(value);
    return absolute ? `Scheduled ${absolute}` : "In the future";
  }

  if (deltaMs < 60_000) {
    return "Just now";
  }

  const deltaSeconds = Math.floor(deltaMs / 1000);
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes} minute${deltaMinutes === 1 ? "" : "s"} ago`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours} hour${deltaHours === 1 ? "" : "s"} ago`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  if (deltaDays < 14) {
    return `${deltaDays} day${deltaDays === 1 ? "" : "s"} ago`;
  }

  return formatHostedAbsoluteTimestamp(value) ?? "Unknown";
}
