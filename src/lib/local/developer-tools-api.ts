import { localFetch } from "@/lib/local/api";
import type {
  ProjectCodeRevision,
  ProjectDisplaySource,
  ProjectScraperSource,
  SaveCodeDraftRequest,
  ValidationResult,
} from "@/lib/developer-tools/types";

export async function localGetScraperSource(projectSlug: string) {
  return localFetch<{ scraper: ProjectScraperSource }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/scraper`,
  );
}

export type ScraperRuntimeSourceFile = {
  path: string;
  source: string;
  editable: boolean;
  category: "project" | "trusted";
  isRunning: boolean;
};

export type ScraperDeveloperContext = {
  engineId: string;
  projectId: string;
  workerId: string | null;
  adapter: string | null;
  latestSnapshotId: string | null;
  publishedRevisionId: string | null;
  draftRevisionId: string | null;
  runningRevisionId: string | null;
  publishedSource: string;
  draftSource: string;
  isDirty: boolean;
  projectSourceFiles: ScraperRuntimeSourceFile[];
  trustedRuntimeFiles: ScraperRuntimeSourceFile[];
  runtimeFiles: ScraperRuntimeSourceFile[];
};

export async function localGetScraperDeveloperContext(
  projectSlug: string,
  engineId: string,
) {
  const params = new URLSearchParams({ engineId });
  return localFetch<{ context: ScraperDeveloperContext }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/scraper/runtime?${params.toString()}`,
  );
}

export async function localRenameDeveloperDisplay(
  projectSlug: string,
  displayId: string,
  name: string,
) {
  return localFetch<{ display: { id: string; name: string; slug: string; displayKey: string } }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}/rename`,
    {
      method: "PATCH",
      body: JSON.stringify({ name }),
    },
  );
}

export async function localUpdateDeveloperDisplayDetails(
  projectSlug: string,
  displayId: string,
  input: { name?: string; description?: string | null },
) {
  return localFetch<{
    display: {
      id: string;
      projectId: string;
      name: string;
      slug: string;
      displayKey: string;
      description: string | null;
      enabled: boolean;
      archived: boolean;
      publishedRevisionId: string | null;
    };
  }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}/details`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export type DisplayVersionSummary = {
  displayId: string;
  displayKey: string;
  activeVersionNumber: number | null;
  activeVersionCreatedAt: string | null;
};

export async function localListDisplayVersionSummaries(projectSlug: string) {
  return localFetch<{ summaries: DisplayVersionSummary[] }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/display-version-summaries`,
  );
}

export async function localSaveScraperDraft(
  projectSlug: string,
  input: SaveCodeDraftRequest & { source: string },
) {
  return localFetch<{ scraper: { draftRevisionId: string | null; draftSavedAt: string | null; isDirty: boolean } }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/scraper/draft`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
}

export async function localValidateScraperDraft(
  projectSlug: string,
  source?: string,
) {
  return localFetch<{ validation: ValidationResult }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/scraper/validate`,
    {
      method: "POST",
      body: JSON.stringify({ source }),
    },
  );
}

export async function localPublishScraperDraft(
  projectSlug: string,
  input: {
    source: string;
    message?: string;
    revisionName?: string;
    changeNote?: string;
  },
) {
  return localFetch<{ publishedRevisionId: string; rolledBack: boolean }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/scraper/publish`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function localListDeveloperDisplays(projectSlug: string) {
  return localFetch<{ displays: ProjectDisplaySource[] }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays`,
  );
}

export async function localGetDeveloperDisplay(
  projectSlug: string,
  displayId: string,
) {
  return localFetch<{ display: ProjectDisplaySource & { html: string; css: string; javascript: string } }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}`,
  );
}

export async function localSaveDisplayDraft(
  projectSlug: string,
  displayId: string,
  input: SaveCodeDraftRequest & { html: string; css: string; javascript: string },
) {
  return localFetch<{ display: { draftSavedAt: string | null; isDirty: boolean } }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}/draft`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
}

export async function localValidateDisplayDraft(
  projectSlug: string,
  displayId: string,
  input: { html: string; css: string; javascript: string },
) {
  return localFetch<{ validation: ValidationResult }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}/validate`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function localPublishDisplayDraft(
  projectSlug: string,
  displayId: string,
  input: {
    html: string;
    css: string;
    javascript: string;
    message?: string;
    revisionName?: string;
    changeNote?: string;
  },
) {
  return localFetch<{ display: { publishedRevisionId: string } }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}/publish`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function localListDeveloperRevisions(
  projectSlug: string,
  input: { resourceType: "scraper" | "display"; resourceId: string },
) {
  const params = new URLSearchParams({
    resourceType: input.resourceType,
    resourceId: input.resourceId,
  });
  return localFetch<{ revisions: ProjectCodeRevision[] }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/revisions?${params.toString()}`,
  );
}

export async function localGetDeveloperRevisionSource(
  projectSlug: string,
  revisionId: string,
) {
  return localFetch<{
    source: {
      revisionId: string;
      resourceType: "scraper" | "display";
      resourceId: string;
      html?: string;
      css?: string;
      javascript?: string;
      createdAt: string;
    };
  }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/revisions/${encodeURIComponent(revisionId)}/source`,
  );
}

export async function localListDeveloperValidationLogs(projectSlug: string) {
  return localFetch<{ logs: Array<Record<string, unknown>> }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/validation-logs`,
  );
}

export async function localCreateDeveloperDisplay(
  projectSlug: string,
  input: {
    name: string;
    slug?: string;
    description?: string;
    html?: string;
    template?: string;
    enabled?: boolean;
    refreshRateMs?: number;
    uploadedFilename?: string;
  },
) {
  return localFetch<{
    display: {
      id: string;
      projectId: string;
      name: string;
      slug: string;
      displayKey: string;
      description: string | null;
      sourceType: "project-html";
      enabled: boolean;
      archived: boolean;
      refreshRateMs: number;
      publishedRevisionId: string;
      activeVersion: {
        id: string;
        versionNumber: number;
        createdAt: string;
      };
    };
    localUrl: string;
  }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function localReorderDeveloperDisplays(
  projectSlug: string,
  displayKeys: string[],
) {
  return localFetch<{ ok: boolean }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/reorder`,
    {
      method: "POST",
      body: JSON.stringify({ displayKeys }),
    },
  );
}

export async function localDuplicateDeveloperDisplay(
  projectSlug: string,
  displayId: string,
  input: { name?: string; description?: string },
) {
  return localFetch<{
    display: {
      id: string;
      projectId: string;
      name: string;
      slug: string;
      displayKey: string;
      description: string | null;
      sourceType: "built-in" | "project-html";
      enabled: boolean;
      archived: boolean;
      refreshRateMs: number;
      publishedRevisionId: string | null;
    };
    localUrl: string;
  }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}/duplicate`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function localSetDeveloperDisplayEnabled(
  projectSlug: string,
  displayId: string,
  enabled: boolean,
) {
  return localFetch<{ display: { enabled: boolean } }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}/enabled`,
    {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    },
  );
}

export async function localArchiveDeveloperDisplay(
  projectSlug: string,
  displayId: string,
) {
  return localFetch<{ display: { archived: boolean } }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}/archive`,
    { method: "POST" },
  );
}

export async function localDeleteDeveloperDisplay(
  projectSlug: string,
  displayId: string,
) {
  return localFetch<{ display: { deleted: boolean } }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}`,
    { method: "DELETE" },
  );
}

export async function localRestoreScraperRevision(
  projectSlug: string,
  revisionId: string,
  input?: { message?: string; revisionName?: string; changeNote?: string },
) {
  return localFetch<{ publishedRevisionId: string; rolledBack: boolean }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/scraper/restore`,
    {
      method: "POST",
      body: JSON.stringify({ revisionId, ...(input ?? {}) }),
    },
  );
}

export async function localRestoreDisplayRevision(
  projectSlug: string,
  displayId: string,
  revisionId: string,
  input?: { message?: string; revisionName?: string; changeNote?: string },
) {
  return localFetch<{ display: { publishedRevisionId: string } }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}/restore`,
    {
      method: "POST",
      body: JSON.stringify({ revisionId, ...(input ?? {}) }),
    },
  );
}

export async function localActivateDisplayRevision(
  projectSlug: string,
  displayId: string,
  revisionId: string,
) {
  return localFetch<{
    display: {
      publishedRevisionId: string;
      html: string;
      css: string;
      javascript: string;
    };
  }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}/activate-revision`,
    {
      method: "POST",
      body: JSON.stringify({ revisionId }),
    },
  );
}

export async function localRenameDisplayRevisionDescription(
  projectSlug: string,
  displayId: string,
  revisionId: string,
  revisionName: string,
) {
  return localFetch<{ revision: { id: string; revisionName: string | null } }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}/revisions/${encodeURIComponent(revisionId)}/description`,
    {
      method: "PATCH",
      body: JSON.stringify({ revisionName }),
    },
  );
}

export async function localDeleteDisplayRevision(
  projectSlug: string,
  displayId: string,
  revisionId: string,
) {
  return localFetch<{ result: { deletedRevisionId: string } }>(
    `/api/projects/${encodeURIComponent(projectSlug)}/developer-tools/displays/${encodeURIComponent(displayId)}/revisions/${encodeURIComponent(revisionId)}`,
    {
      method: "DELETE",
    },
  );
}

export {
  buildProjectDisplayViewerPath,
  buildProjectDisplayOutputPath,
  buildProjectDisplayPreviewPath,
} from "@/lib/displays/display-view-mode";
