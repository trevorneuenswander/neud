/** Hosted viewer publisher/source status messaging (no payload values). */

export type ViewerStatusNoticeTone = "warning" | "info" | "muted";

export type ViewerStatusNoticeKind =
  | "source_offline"
  | "waiting_for_data"
  | "scraper_disconnected"
  | "data_stale";

export type ViewerStatusNotice = {
  kind: ViewerStatusNoticeKind;
  title: string;
  message: string;
  tone: ViewerStatusNoticeTone;
};

export type ViewerStatusInput = {
  sourceOffline: boolean;
  publisherOnline: boolean;
  sourceConnected: boolean;
  sourceMode: string | null;
  dataStale: boolean;
  staleReason: string | null;
  canonicalDataPresent: boolean;
  hasResolvedCanonicalSnapshot: boolean;
};

const EXPLICIT_STALE_REASONS = new Set([
  "explicit_payload_marker",
  "publishing_error",
  "source_stale",
]);

export function hasCanonicalDisplayData(input: {
  canonicalDataPresent: boolean;
  hasResolvedCanonicalSnapshot: boolean;
}): boolean {
  return input.canonicalDataPresent || input.hasResolvedCanonicalSnapshot;
}

export function isExplicitDataStale(staleReason: string | null): boolean {
  if (!staleReason) {
    return false;
  }
  return EXPLICIT_STALE_REASONS.has(staleReason);
}

export function resolveViewerStatusNotice(input: ViewerStatusInput): ViewerStatusNotice | null {
  if (input.sourceOffline) {
    return {
      kind: "source_offline",
      title: "Source Offline",
      message: "The publishing desktop has stopped sending updates.",
      tone: "warning",
    };
  }

  if (!hasCanonicalDisplayData(input)) {
    return {
      kind: "waiting_for_data",
      title: "Waiting for Data",
      message: "The publishing desktop has not sent display data yet.",
      tone: "muted",
    };
  }

  if (input.dataStale && isExplicitDataStale(input.staleReason)) {
    return {
      kind: "data_stale",
      title: "Display Data Stale",
      message: resolveExplicitStaleMessage(input.staleReason),
      tone: "warning",
    };
  }

  if (
    input.publisherOnline &&
    input.sourceMode === "webpage-scraper" &&
    !input.sourceConnected
  ) {
    return {
      kind: "scraper_disconnected",
      title: "Webpage Scraper Disconnected",
      message: "Showing the latest available data.",
      tone: "info",
    };
  }

  return null;
}

function resolveExplicitStaleMessage(staleReason: string | null): string {
  switch (staleReason) {
    case "publishing_error":
      return "Canonical publishing reported an error. Showing the latest available data.";
    case "source_stale":
      return "The selected data source reported stale data.";
    case "explicit_payload_marker":
      return "The published snapshot is marked stale.";
    default:
      return "Display data may be stale.";
  }
}

export function computeAgeSeconds(iso: string | null | undefined): number | null {
  if (!iso) {
    return null;
  }
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) {
    return null;
  }
  return Math.max(0, Math.round(ms / 1000));
}
