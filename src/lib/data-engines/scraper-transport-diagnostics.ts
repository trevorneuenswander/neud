export type ScraperTransportLabel = "Faye" | "DOM" | "Legacy Polling" | "Unknown";

export function normalizeScraperTransportSource(
  value: unknown,
): "faye" | "dom" | "legacy" | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "faye") return "faye";
  if (normalized === "dom") return "dom";
  if (normalized === "legacy" || normalized === "legacy-polling") return "legacy";
  return null;
}

export function formatScraperTransportLabel(source: unknown): ScraperTransportLabel {
  const normalized = normalizeScraperTransportSource(source);
  if (normalized === "faye") return "Faye";
  if (normalized === "dom") return "DOM";
  if (normalized === "legacy") return "Legacy Polling";
  return "Unknown";
}

export function formatScraperTransportSummary(
  liveFeedRuntime: Record<string, unknown> | null | undefined,
  metadata?: Record<string, unknown> | null,
): {
  requestedMode: string;
  activeTransport: ScraperTransportLabel;
  activeSource: string;
  eventDrivenLiveEnabled: boolean | null;
  engineRunId: string | null;
  fallbackReason: string | null;
  fallbackFrom: string | null;
  fallbackTimestamp: string | null;
  fallbackSummary: string | null;
} {
  const runtime = liveFeedRuntime ?? {};
  const meta = metadata ?? {};
  const requestedRaw =
    runtime.liveFeedModePreference ??
    meta.liveFeedModePreference ??
    runtime.liveFeedMode ??
    meta.liveFeedMode ??
    "—";
  const activeSourceRaw =
    runtime.liveFeedActiveSource ??
    runtime.liveFeedMode ??
    meta.liveFeedActiveSource ??
    meta.liveFeedMode ??
    requestedRaw;
  const activeTransport = formatScraperTransportLabel(activeSourceRaw);
  const requestedMode =
    typeof requestedRaw === "string" && requestedRaw.trim()
      ? requestedRaw.trim()
      : "—";
  const fallbackReason =
    typeof runtime.lastFallbackReason === "string"
      ? runtime.lastFallbackReason
      : typeof meta.lastFallbackReason === "string"
        ? meta.lastFallbackReason
        : null;

  let fallbackSummary: string | null = null;
  const requestedNormalized = normalizeScraperTransportSource(requestedMode);
  const activeNormalized = normalizeScraperTransportSource(activeSourceRaw);
  if (
    requestedNormalized &&
    activeNormalized &&
    requestedNormalized !== activeNormalized
  ) {
    fallbackSummary = `Fallback from ${formatScraperTransportLabel(requestedNormalized)} → ${activeTransport}`;
  } else if (fallbackReason) {
    fallbackSummary = fallbackReason;
  }

  const fallbackFrom =
    typeof runtime.lastFallbackFrom === "string"
      ? runtime.lastFallbackFrom
      : typeof meta.lastFallbackFrom === "string"
        ? meta.lastFallbackFrom
        : null;
  const fallbackTimestamp =
    typeof runtime.fallbackTimestamp === "string"
      ? runtime.fallbackTimestamp
      : typeof runtime.lastFallbackAt === "string"
        ? runtime.lastFallbackAt
        : typeof meta.fallbackTimestamp === "string"
          ? meta.fallbackTimestamp
          : null;

  return {
    requestedMode,
    activeTransport,
    activeSource:
      typeof activeSourceRaw === "string" && activeSourceRaw.trim()
        ? activeSourceRaw.trim()
        : "—",
    eventDrivenLiveEnabled:
      typeof runtime.eventDrivenLiveEnabled === "boolean"
        ? runtime.eventDrivenLiveEnabled
        : null,
    engineRunId:
      typeof runtime.engineRunId === "string" && runtime.engineRunId.trim()
        ? runtime.engineRunId.trim()
        : null,
    fallbackReason,
    fallbackFrom,
    fallbackTimestamp,
    fallbackSummary,
  };
}
