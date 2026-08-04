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

export function buildHtmlDisplayDocumentPath(input: {
  projectId: string;
  slug: string;
  refreshRateMs: number;
  outputMode?: boolean;
  previewMode?: boolean;
  publishedRevisionId?: string | null;
}): string {
  const params = new URLSearchParams({ poll: String(input.refreshRateMs) });
  if (input.outputMode) {
    params.set("output", "1");
  }
  if (input.previewMode) {
    params.set("preview", "1");
  }
  if (input.publishedRevisionId) {
    params.set("revision", input.publishedRevisionId);
  }
  return `/api/display-html/${encodeURIComponent(input.projectId)}/${encodeURIComponent(input.slug)}?${params.toString()}`;
}
