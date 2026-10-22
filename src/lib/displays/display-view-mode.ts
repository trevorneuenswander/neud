export type DisplayViewMode = "output" | "viewer";

export function resolveDisplayViewMode(input: {
  preview?: string | null;
  mode?: string | null;
}): DisplayViewMode {
  if (input.preview === "1") {
    return "viewer";
  }
  if (input.mode === "viewer") {
    return "viewer";
  }
  return "output";
}

export function buildProjectDisplayViewerPath(
  projectId: string,
  slug: string,
  origin?: string,
): string {
  const path = `/display/${encodeURIComponent(projectId)}/${encodeURIComponent(slug)}`;
  if (!origin) {
    return path;
  }
  return `${origin.replace(/\/$/, "")}${path}`;
}

export function buildProjectDisplayOutputPath(
  projectId: string,
  slug: string,
  options?: { poll?: number; origin?: string },
): string {
  const params = new URLSearchParams({ mode: "output" });
  if (typeof options?.poll === "number" && Number.isFinite(options.poll)) {
    params.set("poll", String(options.poll));
  }
  const path = `/display/${encodeURIComponent(projectId)}/${encodeURIComponent(slug)}?${params.toString()}`;
  if (!options?.origin) {
    return path;
  }
  return `${options.origin.replace(/\/$/, "")}${path}`;
}

export function buildProjectDisplayPreviewPath(
  projectId: string,
  slug: string,
  options?: {
    poll?: number;
    revision?: string | null;
    origin?: string;
  },
): string {
  const params = new URLSearchParams({ preview: "1" });
  if (typeof options?.poll === "number" && Number.isFinite(options.poll)) {
    params.set("poll", String(options.poll));
  }
  if (options?.revision) {
    params.set("revision", options.revision);
  }
  const path = `/display/${encodeURIComponent(projectId)}/${encodeURIComponent(slug)}?${params.toString()}`;
  if (!options?.origin) {
    return path;
  }
  return `${options.origin.replace(/\/$/, "")}${path}`;
}

export function buildDisplayWindowFitPath(input: {
  targetUrl: string;
  displayWidth: number;
  displayHeight: number;
  origin?: string;
}): string {
  const params = new URLSearchParams({
    target: input.targetUrl,
    width: String(input.displayWidth),
    height: String(input.displayHeight),
  });
  const path = `/display/window-fit?${params.toString()}`;
  if (!input.origin) {
    return path;
  }
  return `${input.origin.replace(/\/$/, "")}${path}`;
}

const STREAM_BID_DEBUG_QUERY_KEYS = ["titleFixture", "titleFontDiag"] as const;

/** Copy debug query keys onto a display-document URL. Supports `?` and `&`. */
export function appendStreamBidDebugParams(
  params: URLSearchParams,
  source: string | URLSearchParams | null | undefined,
): void {
  if (!source) return;
  const incoming =
    typeof source === "string"
      ? new URLSearchParams(source.startsWith("?") ? source.slice(1) : source)
      : source;
  for (const key of STREAM_BID_DEBUG_QUERY_KEYS) {
    if (params.has(key)) continue;
    const value = incoming.get(key);
    if (value != null) {
      params.set(key, value);
    }
  }
}

export function buildHtmlDisplayDocumentPath(input: {
  projectId: string;
  slug: string;
  refreshRateMs?: number;
  outputMode?: boolean;
  previewMode?: boolean;
  publishedRevisionId?: string | null;
  pinnedPreview?: boolean;
  previewSample?: string | number | null;
  hideCursor?: boolean;
  /** Parent page search (`location.search`). Forwards titleFixture / titleFontDiag. */
  parentSearch?: string | null;
}): string {
  const params = new URLSearchParams();
  if (typeof input.refreshRateMs === "number" && Number.isFinite(input.refreshRateMs)) {
    params.set("poll", String(input.refreshRateMs));
  }
  if (input.outputMode) {
    params.set("output", "1");
  }
  if (input.previewMode) {
    params.set("preview", "1");
  }
  if (input.pinnedPreview) {
    params.set("pinnedPreview", "1");
  }
  if (input.previewSample != null && String(input.previewSample).trim()) {
    params.set("previewSample", String(input.previewSample));
  }
  if (input.publishedRevisionId) {
    params.set("revision", input.publishedRevisionId);
  }
  if (input.hideCursor) {
    params.set("surface", "computer");
    params.set("hideCursor", "1");
  }
  appendStreamBidDebugParams(params, input.parentSearch);
  return `/api/display-html/${encodeURIComponent(input.projectId)}/${encodeURIComponent(input.slug)}?${params.toString()}`;
}
