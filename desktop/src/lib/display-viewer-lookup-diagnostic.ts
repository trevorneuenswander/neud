export type DisplayViewerLookupStage =
  | "project_not_found"
  | "display_code_not_found"
  | "display_row_not_found"
  | "display_deleted"
  | "published_content_missing"
  | "ok";

export type DisplayViewerLookupDiagnostic = {
  stage: DisplayViewerLookupStage;
  routeProjectSegment: string;
  routeDisplaySlug: string;
  previewMode: boolean;
  resolvedProjectId: string | null;
  resolvedProjectSlug: string | null;
  displayId: string | null;
  displayProjectId: string | null;
  displaySlug: string | null;
  displayKey: string | null;
  publishedRevisionId: string | null;
  hasPublishedBundle: boolean;
  hasRevisionBundle: boolean;
  hasDraftHtml: boolean;
  projectById: boolean;
  projectBySlug: boolean;
  slugFallbackProjectId: string | null;
};

type LookupInput = {
  routeProjectSegment: string;
  routeDisplaySlug: string;
  previewMode: boolean;
  projects: {
    getById(id: string): { id: string; slug: string } | null;
    getBySlug(slug: string): { id: string; slug: string } | null;
    list(): Array<{ id: string; slug: string }>;
  };
  displayCode: {
    getBySlug(
      projectId: string,
      slug: string,
    ): {
      displayId: string;
      projectId: string;
      slug: string;
      publishedRevisionId: string | null;
      draftHtml: string | null;
    } | null;
  };
  displays: {
    getById(id: string): { id: string; projectId: string; displayKey: string } | null;
  };
  displaySyncHooks: { isDeleted?(displayId: string): boolean };
  storage: {
    readDisplayPublished(
      projectId: string,
      displayId: string,
    ): { html: string } | null;
    readDisplayRevision(
      projectId: string,
      displayId: string,
      revisionId: string,
    ): { html: string } | null;
  };
};

export function buildDisplayViewerLookupDiagnostic(input: LookupInput): DisplayViewerLookupDiagnostic {
  const trimmedProject = input.routeProjectSegment.trim();
  const trimmedSlug = input.routeDisplaySlug.trim();

  const projectById = Boolean(input.projects.getById(trimmedProject));
  const projectBySlug = Boolean(input.projects.getBySlug(trimmedProject));

  let project =
    input.projects.getById(trimmedProject) ??
    input.projects.getBySlug(trimmedProject) ??
    null;

  let slugFallbackProjectId: string | null = null;
  if (project && trimmedSlug && input.displayCode.getBySlug(project.id, trimmedSlug)) {
    // matched on requested segment
  } else if (trimmedSlug) {
    for (const candidate of input.projects.list()) {
      if (input.displayCode.getBySlug(candidate.id, trimmedSlug)) {
        project = candidate;
        slugFallbackProjectId = candidate.id;
        break;
      }
    }
  }

  const base: DisplayViewerLookupDiagnostic = {
    stage: "project_not_found",
    routeProjectSegment: trimmedProject,
    routeDisplaySlug: trimmedSlug,
    previewMode: input.previewMode,
    resolvedProjectId: project?.id ?? null,
    resolvedProjectSlug: project?.slug ?? null,
    displayId: null,
    displayProjectId: null,
    displaySlug: null,
    displayKey: null,
    publishedRevisionId: null,
    hasPublishedBundle: false,
    hasRevisionBundle: false,
    hasDraftHtml: false,
    projectById,
    projectBySlug,
    slugFallbackProjectId,
  };

  if (!project) {
    return base;
  }

  const code = trimmedSlug ? input.displayCode.getBySlug(project.id, trimmedSlug) : null;
  if (!code) {
    return { ...base, stage: "display_code_not_found" };
  }

  const display = input.displays.getById(code.displayId);
  if (!display) {
    return {
      ...base,
      stage: "display_row_not_found",
      displayId: code.displayId,
      displayProjectId: code.projectId,
      displaySlug: code.slug,
      publishedRevisionId: code.publishedRevisionId,
      hasDraftHtml: Boolean(code.draftHtml?.trim()),
    };
  }

  if (input.displaySyncHooks.isDeleted?.(code.displayId)) {
    return {
      ...base,
      stage: "display_deleted",
      displayId: code.displayId,
      displayProjectId: display.projectId,
      displaySlug: code.slug,
      displayKey: display.displayKey,
      publishedRevisionId: code.publishedRevisionId,
      hasDraftHtml: Boolean(code.draftHtml?.trim()),
    };
  }

  const published = input.storage.readDisplayPublished(project.id, code.displayId);
  const revision =
    code.publishedRevisionId != null
      ? input.storage.readDisplayRevision(project.id, code.displayId, code.publishedRevisionId)
      : null;

  const hasPublishedBundle = Boolean(published?.html?.trim());
  const hasRevisionBundle = Boolean(revision?.html?.trim());
  const hasDraftHtml = Boolean(code.draftHtml?.trim());

  if (!hasPublishedBundle && !(input.previewMode && (hasRevisionBundle || hasDraftHtml))) {
    return {
      ...base,
      stage: "published_content_missing",
      displayId: code.displayId,
      displayProjectId: display.projectId,
      displaySlug: code.slug,
      displayKey: display.displayKey,
      publishedRevisionId: code.publishedRevisionId,
      hasPublishedBundle,
      hasRevisionBundle,
      hasDraftHtml,
    };
  }

  return {
    ...base,
    stage: "ok",
    displayId: code.displayId,
    displayProjectId: display.projectId,
    displaySlug: code.slug,
    displayKey: display.displayKey,
    publishedRevisionId: code.publishedRevisionId,
    hasPublishedBundle,
    hasRevisionBundle,
    hasDraftHtml,
  };
}
