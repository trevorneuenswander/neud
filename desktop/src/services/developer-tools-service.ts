import fs from "fs";
import path from "path";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import type { DisplaysRepository } from "../repositories/displays-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import type { ProjectDisplayCodeRepository } from "../repositories/project-display-code-repository";
import {
  createRevisionId,
  hashSource,
  ProjectScraperCodeRepository,
} from "../repositories/project-scraper-code-repository";
import {
  ProjectCodeRevisionsRepository,
  ProjectValidationLogsRepository,
} from "../repositories/project-code-revisions-repository";
import {
  BLANK_DISPLAY_CSS,
  BLANK_DISPLAY_HTML,
  BLANK_DISPLAY_JAVASCRIPT,
  DEFAULT_SCRAPER_TEMPLATE,
  buildDisplayDocument,
  buildTransparentOutputShellHtml,
  wrapStandaloneDisplayHtml,
} from "../developer-tools/templates";
import {
  applyHtmlDisplayRuntimeAdapters,
  resolveDisplayRuntimeAdapterKey,
} from "../displays/html-display-runtime-adapters";
import { sanitizeDisplaySlug, assertSafeResourceId } from "../developer-tools/path-utils";
import { generateDisplaySlugFromName } from "../displays/display-utils";
import {
  isAllowedDisplayRefreshRateMs,
  normalizeDisplayRefreshRateMs,
} from "../displays/refresh-rate";
import {
  DEFAULT_DISPLAY_HEIGHT,
  DEFAULT_DISPLAY_WIDTH,
  normalizeDisplaySize,
} from "../displays/display-size";
import type { ProjectCodeStorageService } from "./project-code-storage-service";
import { buildDisplayViewerLookupDiagnostic } from "../lib/display-viewer-lookup-diagnostic";
import { validateDisplaySource, validateDisplaySlug } from "./display-code-validation-service";
import { validateScraperSource } from "./scraper-code-validation-service";
import type { AuthLicenseManager } from "./auth-license-manager";
import type { DataSourcesRepository } from "../repositories/data-sources-repository";
import type { EngineManager } from "./engine-manager";
import type { LocalProjectMembershipsRepository } from "../repositories/local-project-memberships-repository";
import { canAccessProject, canManageProjectSettings } from "../projects/project-permissions";
import { getApplicationRole } from "../auth/application-roles";
import {
  buildRevisionMessage,
  normalizeChangeNote,
  normalizeRevisionName,
  resolveRunningRuntimeFilePaths,
} from "../developer-tools/revision-labels";

const MIGRATION_SETTING_PREFIX = "developerTools.migrated.";
const PROTECTED_DISPLAY_KEYS = new Set([
  "pylon",
  "lower-ticker-v5",
  "new-bid-display-v1",
  "new-ticker-v1",
]);
const MAX_DISPLAY_DESCRIPTION_LENGTH = 500;

type ActivityRecorder = (input: {
  type: string;
  message: string;
  metadata?: Record<string, unknown>;
  actor?: { id?: string; name: string; email?: string };
}) => void;

type DisplaySyncHooks = {
  queueOperation?: (input: {
    operationType: string;
    entityType: string;
    entityId: string;
    payload?: Record<string, unknown>;
  }) => void;
  syncNow?: (reason?: string) => void;
  recordDeletion?: (input: {
    displayId: string;
    projectId: string;
    deletedByUserId?: string | null;
  }) => void;
  isDeleted?: (displayId: string) => boolean;
  reconcileProjectPublishing?: (projectId: string) => void;
};

export class ProjectCodeMigrationService {
  constructor(
    private readonly settings: AppSettingsRepository,
    private readonly projects: ProjectsRepository,
    private readonly displays: DisplaysRepository,
    private readonly displayCode: ProjectDisplayCodeRepository,
    private readonly scraperCode: ProjectScraperCodeRepository,
    private readonly revisions: ProjectCodeRevisionsRepository,
    private readonly storage: ProjectCodeStorageService,
    private readonly repoRoot: string,
  ) {}

  ensureProjectMigrated(projectId: string, actorId: string) {
    const key = `${MIGRATION_SETTING_PREFIX}${projectId}`;
    if (this.settings.get<boolean>(key, false)) {
      return { migrated: false };
    }

    const project = this.projects.getById(projectId);
    if (!project) {
      throw new Error("Project not found.");
    }

    this.seedScraper(projectId, actorId);
    this.seedDisplays(projectId, actorId);
    this.settings.set(key, true);
    return { migrated: true };
  }

  private seedScraper(projectId: string, actorId: string) {
    if (this.scraperCode.get(projectId)) {
      return;
    }

    const source = DEFAULT_SCRAPER_TEMPLATE;
    const revisionId = createRevisionId();
    this.storage.writeScraperPublished(projectId, source, {
      seeded: true,
      revisionId,
    });
    this.storage.writeScraperRevision(projectId, revisionId, source, {
      seeded: true,
    });
    this.revisions.create({
      id: revisionId,
      projectId,
      resourceType: "scraper",
      resourceId: projectId,
      sourceHash: hashSource(source),
      validationStatus: "valid",
      createdBy: actorId,
      message: "Initial scraper seed",
      metadata: { storageRevisionId: revisionId },
    });
    this.scraperCode.upsert({
      projectId,
      publishedSource: source,
      draftSource: source,
      publishedRevisionId: revisionId,
      draftRevisionId: revisionId,
      updatedBy: actorId,
      seededAt: new Date().toISOString(),
    });
  }

  private seedDisplays(projectId: string, actorId: string) {
    const rows = this.displays.listByProject(projectId);
    for (const display of rows) {
      if (this.displayCode.getByDisplayId(display.id)) {
        continue;
      }

      const bundled = this.readBundledDisplay(display.displayKey);
      const html = bundled?.html ?? BLANK_DISPLAY_HTML;
      const css = bundled?.css ?? BLANK_DISPLAY_CSS;
      const javascript = bundled?.javascript ?? BLANK_DISPLAY_JAVASCRIPT;
      const revisionId = createRevisionId();

      this.storage.writeDisplayPublished(projectId, display.id, {
        html,
        css,
        javascript,
        metadata: { seeded: true, displayKey: display.displayKey, revisionId },
      });
      this.storage.writeDisplayRevision(projectId, display.id, revisionId, {
        html,
        css,
        javascript,
        metadata: { seeded: true, displayKey: display.displayKey },
      });
      this.revisions.create({
        id: revisionId,
        projectId,
        resourceType: "display",
        resourceId: display.id,
        sourceHash: hashSource(`${html}\n${css}\n${javascript}`),
        validationStatus: "valid",
        createdBy: actorId,
        message: "Initial display seed",
        metadata: { storageRevisionId: revisionId },
      });
      this.displayCode.upsert({
        displayId: display.id,
        projectId,
        slug: display.displayKey,
        description: display.name,
        sourceType: "built-in",
        draftHtml: html,
        draftCss: css,
        draftJavascript: javascript,
        publishedRevisionId: revisionId,
        updatedBy: actorId,
      });
    }
  }

  private readBundledDisplay(displayKey: string) {
    const bundledPath = path.join(
      this.repoRoot,
      "public",
      "displays",
      displayKey,
      "index.html",
    );
    if (!fs.existsSync(bundledPath)) {
      return null;
    }
    const html = fs.readFileSync(bundledPath, "utf8");
    return {
      html,
      css: "",
      javascript: "",
    };
  }
}

export class DeveloperToolsService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly displays: DisplaysRepository,
    private readonly scraperCode: ProjectScraperCodeRepository,
    private readonly displayCode: ProjectDisplayCodeRepository,
    private readonly revisions: ProjectCodeRevisionsRepository,
    private readonly validationLogs: ProjectValidationLogsRepository,
    private readonly storage: ProjectCodeStorageService,
    private readonly migration: ProjectCodeMigrationService,
    private readonly auth: AuthLicenseManager,
    private readonly memberships: LocalProjectMembershipsRepository,
    private readonly dataSources: DataSourcesRepository,
    private readonly engineManager: EngineManager | null,
    private readonly recordActivity: ActivityRecorder | null = null,
    private readonly localApiBaseUrl: string | null = null,
    private readonly onDisplayDeleted?: (input: {
      projectId: string;
      displayId: string;
    }) => void,
    private readonly onDisplayDuplicated?: (input: {
      projectId: string;
      sourceDisplayId: string;
      displayId: string;
    }) => void,
    private readonly onDisplayUnarchived?: (input: {
      projectId: string;
      displayId: string;
    }) => void,
    private readonly onDisplayCreated?: (input: {
      projectId: string;
      displayId: string;
    }) => void,
    private readonly displaySyncHooks: DisplaySyncHooks = {},
  ) {}

  assertDeveloperToolsAccess(projectId: string) {
    const user = this.auth.getAuthenticatedUser();
    if (!user) {
      throw new Error("Sign in to your NEUD account to continue.");
    }

    const membershipRole = this.memberships.getProjectRole(user.userId, projectId);
    const role = membershipRole ?? getApplicationRole({ role: user.role });
    if (!canManageProjectSettings(role)) {
      throw new Error("Developer Tools are restricted to project owners and admins.");
    }

    return {
      userId: user.userId,
      displayName: user.displayName ?? user.email ?? "Unknown User",
      role,
    };
  }

  private assertProjectViewAccess(project: {
    id: string;
    is_active?: boolean | number | null;
    isActive?: boolean | null;
  }) {
    const user = this.auth.getAuthenticatedUser();
    if (!user) {
      throw new Error("Sign in to your NEUD account to continue.");
    }

    const membershipRole = this.memberships.getProjectRole(user.userId, project.id);
    const role = membershipRole ?? getApplicationRole({ role: user.role });
    if (!canAccessProject(role, project)) {
      throw new Error("You do not have permission to view this project.");
    }

    return user;
  }

  private resolveDisplayRecord(projectId: string, displayIdOrKey: string) {
    return (
      this.displays.getById(displayIdOrKey) ??
      this.displays.listByProject(projectId).find(
        (row) =>
          row.projectId === projectId &&
          (row.id === displayIdOrKey || row.displayKey === displayIdOrKey),
      ) ??
      null
    );
  }

  getScraperBundle(projectSlug: string) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    this.migration.ensureProjectMigrated(project.id, actor.userId);
    const row = this.scraperCode.get(project.id);
    if (!row) {
      throw new Error("Scraper code has not been initialized for this project.");
    }

    const draftSource = row.draftSource ?? row.publishedSource;
    return {
      projectId: project.id,
      projectName: project.name,
      language: row.language,
      entryFilename: row.entryFilename,
      draftSource,
      publishedSource: row.publishedSource,
      draftRevisionId: row.draftRevisionId,
      publishedRevisionId: row.publishedRevisionId,
      isDirty: draftSource !== row.publishedSource,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
      draftSavedAt: row.draftSavedAt,
    };
  }

  getScraperDeveloperContext(projectSlug: string, engineId: string) {
    const project = this.requireProject(projectSlug);
    this.assertDeveloperToolsAccess(project.id);
    const bundle = this.getScraperBundle(projectSlug);
    const publishedFile = this.storage.readScraperPublished(project.id);
    const status = this.dataSources.getStatus(engineId);
    const latestSnapshot = this.dataSources.getLatestSnapshot(engineId);
    const engine = this.dataSources.getById(engineId);
    const adapterName =
      typeof engine?.config?.adapter === "string" ? engine.config.adapter : null;
    const runningPaths = resolveRunningRuntimeFilePaths(adapterName);
    const runtimeFiles = this.storage.listDataEngineRuntimeFiles();
    const entryFilename = bundle.entryFilename || "scraper.js";

    const projectSourceFiles = publishedFile?.source
      ? [
          {
            path: `scraper/${entryFilename}`,
            source: publishedFile.source,
            editable: true,
            category: "project" as const,
            isRunning: false,
          },
        ]
      : [];

    const draftSource = bundle.draftSource;
    if (bundle.isDirty && draftSource && draftSource !== publishedFile?.source) {
      projectSourceFiles.push({
        path: `scraper/${entryFilename} (draft)`,
        source: draftSource,
        editable: true,
        category: "project" as const,
        isRunning: false,
      });
    }

    const trustedRuntimeFiles = runtimeFiles.map((file) => ({
      path: file.path,
      source: file.source,
      editable: false,
      category: "trusted" as const,
      isRunning: runningPaths.has(file.path),
    }));

    return {
      engineId,
      projectId: project.id,
      workerId: status?.workerId ?? null,
      adapter: adapterName,
      latestSnapshotId: latestSnapshot?.id ?? null,
      publishedRevisionId: bundle.publishedRevisionId,
      draftRevisionId: bundle.draftRevisionId,
      runningRevisionId: bundle.publishedRevisionId,
      publishedSource: bundle.publishedSource,
      draftSource: bundle.draftSource,
      isDirty: bundle.isDirty,
      projectSourceFiles,
      trustedRuntimeFiles,
      runtimeFiles: [...projectSourceFiles, ...trustedRuntimeFiles],
    };
  }

  saveScraperDraft(
    projectSlug: string,
    input: { baseRevisionId: string | null; source: string },
  ) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const row = this.scraperCode.get(project.id);
    if (!row) {
      throw new Error("Scraper code has not been initialized for this project.");
    }

    if (
      input.baseRevisionId &&
      row.draftRevisionId &&
      input.baseRevisionId !== row.draftRevisionId
    ) {
      throw new Error(
        "This code was updated by another user. Review the newer version before saving.",
      );
    }

    const now = new Date().toISOString();
    const next = this.scraperCode.upsert({
      projectId: project.id,
      draftSource: input.source,
      draftRevisionId: row.draftRevisionId ?? row.publishedRevisionId,
      draftSavedAt: now,
      updatedBy: actor.userId,
    });

    return {
      draftRevisionId: next.draftRevisionId,
      draftSavedAt: next.draftSavedAt,
      isDirty: input.source !== next.publishedSource,
    };
  }

  validateScraperDraft(projectSlug: string, source?: string) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const row = this.scraperCode.get(project.id);
    if (!row) {
      throw new Error("Scraper code has not been initialized for this project.");
    }

    const draft = source ?? row.draftSource ?? row.publishedSource;
    const result = validateScraperSource(draft);
    this.validationLogs.append({
      projectId: project.id,
      resourceType: "scraper",
      resourceId: project.id,
      status: result.ok ? "valid" : "invalid",
      summary: result.ok ? "Scraper draft validated." : "Scraper draft failed validation.",
      details: result.issues,
      createdBy: actor.userId,
    });
    return result;
  }

  async publishScraper(
    projectSlug: string,
    input: {
      source: string;
      message?: string;
      revisionName?: string | null;
      changeNote?: string | null;
    },
  ) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const validation = validateScraperSource(input.source);
    if (!validation.ok) {
      throw new Error("Scraper code must pass validation before publishing.");
    }

    const revisionName = normalizeRevisionName(input.revisionName ?? input.message);
    const changeNote = normalizeChangeNote(input.changeNote);
    const message = buildRevisionMessage({
      revisionName,
      changeNote,
      fallback: "Scraper code published",
    });

    const previous = this.scraperCode.get(project.id);
    const previousRevisionId = previous?.publishedRevisionId ?? null;
    const revisionId = createRevisionId();

    this.storage.writeScraperRevision(project.id, revisionId, input.source, {
      revisionName,
      changeNote,
      message,
      publishedBy: actor.userId,
    });
    this.storage.writeScraperPublished(project.id, input.source, {
      revisionId,
      revisionName,
      changeNote,
      publishedBy: actor.userId,
    });
    this.revisions.create({
      id: revisionId,
      projectId: project.id,
      resourceType: "scraper",
      resourceId: project.id,
      revisionName,
      changeNote,
      sourceHash: hashSource(input.source),
      validationStatus: "valid",
      createdBy: actor.userId,
      message,
      metadata: { storageRevisionId: revisionId },
    });

    this.scraperCode.upsert({
      projectId: project.id,
      draftSource: input.source,
      publishedSource: input.source,
      draftRevisionId: revisionId,
      publishedRevisionId: revisionId,
      draftSavedAt: new Date().toISOString(),
      updatedBy: actor.userId,
    });

    try {
      await this.restartProjectScraper(project.id);
      this.recordProjectActivity(
        project,
        {
          type: "developer-tools.scraper-published",
          message: revisionName ? `Scraper code published: ${revisionName}` : "Scraper code published",
          metadata: { revisionId, revisionName, changeNote },
        },
        actor,
      );
      return {
        publishedRevisionId: revisionId,
        rolledBack: false,
      };
    } catch (error) {
      if (previous?.publishedSource && previousRevisionId) {
        this.storage.writeScraperPublished(project.id, previous.publishedSource, {
          revisionId: previousRevisionId,
        });
        this.scraperCode.upsert({
          projectId: project.id,
          publishedSource: previous.publishedSource,
          publishedRevisionId: previousRevisionId,
          draftSource: previous.publishedSource,
          draftRevisionId: previousRevisionId,
          updatedBy: actor.userId,
        });
        await this.restartProjectScraper(project.id);
      }
      throw new Error(
        error instanceof Error
          ? `Publish failed and previous scraper revision was restored: ${error.message}`
          : "Publish failed and previous scraper revision was restored.",
      );
    }
  }

  listDisplayVersionSummaries(projectSlug: string) {
    const project = this.requireProject(projectSlug);
    const user = this.assertProjectViewAccess(project);
    this.migration.ensureProjectMigrated(project.id, user.userId);

    return this.displays.listByProject(project.id).map((display) => {
      const code = this.displayCode.getByDisplayId(display.id);
      if (!code?.publishedRevisionId) {
        return {
          displayId: display.id,
          displayKey: display.displayKey,
          activeVersionNumber: null,
          activeVersionCreatedAt: null,
        };
      }

      const revisionHistory = this.revisions.listForResource({
        projectId: project.id,
        resourceType: "display",
        resourceId: display.id,
      });
      const activeRevision = this.revisions.getById(code.publishedRevisionId);

      return {
        displayId: display.id,
        displayKey: display.displayKey,
        activeVersionNumber: activeRevision
          ? this.resolveDisplayRevisionVersionNumber(activeRevision, revisionHistory)
          : null,
        activeVersionCreatedAt: activeRevision?.createdAt ?? null,
      };
    });
  }

  private resolveDisplayRevisionVersionNumber(
    revision: NonNullable<ReturnType<ProjectCodeRevisionsRepository["getById"]>>,
    allRevisions: ReturnType<ProjectCodeRevisionsRepository["listForResource"]>,
  ): number | null {
    if (typeof revision.versionNumber === "number" && revision.versionNumber > 0) {
      return revision.versionNumber;
    }

    const sorted = [...allRevisions].sort((left, right) => {
      const byCreated =
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      if (byCreated !== 0) {
        return byCreated;
      }
      return left.id.localeCompare(right.id);
    });
    const index = sorted.findIndex((entry) => entry.id === revision.id);
    return index >= 0 ? index + 1 : null;
  }

  listDisplays(projectSlug: string) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    this.migration.ensureProjectMigrated(project.id, actor.userId);

    return this.displays
      .listByProject(project.id)
      .map((display) => {
        const code = this.displayCode.getByDisplayId(display.id);
        return {
          id: display.id,
          projectId: project.id,
          name: display.name,
          slug: code?.slug ?? display.displayKey,
          displayKey: display.displayKey,
          description: code?.description ?? null,
          sourceType: code?.sourceType ?? "built-in",
          enabled: display.enabled,
          archived: code?.archived ?? false,
          refreshRateMs: display.refreshRateMs,
          publishedRevisionId: code?.publishedRevisionId ?? null,
          updatedAt: code?.updatedAt ?? display.updatedAt,
          updatedBy: code?.updatedBy ?? null,
        };
      })
      .filter((display) => !display.archived);
  }

  listArchivedDisplays(projectSlug: string) {
    const project = this.requireProject(projectSlug);
    this.assertDeveloperToolsAccess(project.id);
    this.migration.ensureProjectMigrated(
      project.id,
      this.auth.getAuthenticatedUser()?.userId ?? "system",
    );

    return this.displays
      .listByProject(project.id)
      .map((display) => {
        const code = this.displayCode.getByDisplayId(display.id);
        if (!code?.archived) {
          return null;
        }

        const activeRevision = code.publishedRevisionId
          ? this.revisions.getById(code.publishedRevisionId)
          : null;
        const activeVersionNumber = activeRevision?.versionNumber ?? null;

        return {
          id: display.id,
          projectId: project.id,
          name: display.name,
          slug: code.slug,
          displayKey: display.displayKey,
          description: code.description,
          enabled: display.enabled,
          refreshRateMs: display.refreshRateMs,
          displayWidth: display.displayWidth,
          displayHeight: display.displayHeight,
          activeVersionNumber,
          archivedAt: code.archivedAt,
          archivedByUserId: code.archivedByUserId,
        };
      })
      .filter((display): display is NonNullable<typeof display> => display !== null)
      .sort((left, right) => {
        const leftTime = left.archivedAt ? new Date(left.archivedAt).getTime() : 0;
        const rightTime = right.archivedAt ? new Date(right.archivedAt).getTime() : 0;
        return rightTime - leftTime;
      });
  }

  getDisplaySource(projectSlug: string, displayIdOrKey: string) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    this.migration.ensureProjectMigrated(project.id, actor.userId);
    const display = this.resolveDisplayRecord(project.id, displayIdOrKey);
    if (!display) {
      throw new Error("Display not found.");
    }
    let code = this.displayCode.getByDisplayId(display.id);
    if (!code) {
      throw new Error("Display code has not been initialized.");
    }

    const published = this.storage.readDisplayPublished(project.id, display.id);
    return {
      id: display.id,
      projectId: project.id,
      name: display.name,
      slug: code.slug,
      displayKey: display.displayKey,
      description: code.description,
      sourceType: code.sourceType,
      enabled: display.enabled,
      archived: code.archived,
      html: code.draftHtml ?? published?.html ?? "",
      css: code.draftCss ?? published?.css ?? "",
      javascript: code.draftJavascript ?? published?.javascript ?? "",
      publishedRevisionId: code.publishedRevisionId,
      draftRevisionId: code.publishedRevisionId,
      isDirty:
        (code.draftHtml ?? "") !== (published?.html ?? "") ||
        (code.draftCss ?? "") !== (published?.css ?? "") ||
        (code.draftJavascript ?? "") !== (published?.javascript ?? ""),
      updatedAt: code.updatedAt,
      updatedBy: code.updatedBy,
      draftSavedAt: code.draftSavedAt,
    };
  }

  saveDisplayDraft(
    projectSlug: string,
    displayId: string,
    input: {
      baseRevisionId: string | null;
      html: string;
      css: string;
      javascript: string;
    },
  ) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const code = this.displayCode.getByDisplayId(displayId);
    if (!code || code.projectId !== project.id) {
      throw new Error("Display not found.");
    }

    if (
      input.baseRevisionId &&
      code.publishedRevisionId &&
      input.baseRevisionId !== code.publishedRevisionId
    ) {
      throw new Error(
        "This code was updated by another user. Review the newer version before saving.",
      );
    }

    const now = new Date().toISOString();
    const next = this.displayCode.upsert({
      displayId,
      projectId: project.id,
      slug: code.slug,
      draftHtml: input.html,
      draftCss: input.css,
      draftJavascript: input.javascript,
      draftSavedAt: now,
      updatedBy: actor.userId,
    });

    return {
      draftSavedAt: next.draftSavedAt,
      isDirty: true,
    };
  }

  validateDisplayDraft(
    projectSlug: string,
    displayId: string,
    input?: { html: string; css: string; javascript: string },
  ) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const code = this.displayCode.getByDisplayId(displayId);
    if (!code) {
      throw new Error("Display not found.");
    }

    const result = validateDisplaySource({
      slug: code.slug,
      html: input?.html ?? code.draftHtml ?? "",
      css: input?.css ?? code.draftCss ?? "",
      javascript: input?.javascript ?? code.draftJavascript ?? "",
    });

    this.validationLogs.append({
      projectId: project.id,
      resourceType: "display",
      resourceId: displayId,
      status: result.ok ? "valid" : "invalid",
      summary: result.ok ? "Display draft validated." : "Display draft failed validation.",
      details: result.issues,
      createdBy: actor.userId,
    });

    return result;
  }

  publishDisplay(
    projectSlug: string,
    displayId: string,
    input: {
      html: string;
      css: string;
      javascript: string;
      message?: string;
      revisionName?: string | null;
      changeNote?: string | null;
    },
  ) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const code = this.displayCode.getByDisplayId(displayId);
    if (!code) {
      throw new Error("Display not found.");
    }

    const validation = validateDisplaySource({
      slug: code.slug,
      html: input.html,
      css: input.css,
      javascript: input.javascript,
    });
    if (!validation.ok) {
      throw new Error("Display code must pass validation before publishing.");
    }

    const nextSourceHash = hashSource(`${input.html}\n${input.css}\n${input.javascript}`);
    const published = this.storage.readDisplayPublished(project.id, displayId);
    if (published) {
      const currentHash = hashSource(
        `${published.html}\n${published.css}\n${published.javascript}`,
      );
      if (currentHash === nextSourceHash) {
        throw new Error("No HTML changes to save as a new version.");
      }
    }

    const revisionName = normalizeRevisionName(input.revisionName ?? input.message);
    const changeNote = normalizeChangeNote(input.changeNote);
    const message = buildRevisionMessage({
      revisionName,
      changeNote,
      fallback: "Display code published",
    });

    const revisionId = createRevisionId();
    const bundle = {
      html: input.html,
      css: input.css,
      javascript: input.javascript,
      metadata: {
        revisionId,
        revisionName,
        changeNote,
        publishedBy: actor.userId,
        message,
      },
    };

    this.storage.writeDisplayRevision(project.id, displayId, revisionId, bundle);
    this.storage.writeDisplayPublished(project.id, displayId, bundle);
    const createdRevision = this.revisions.create({
      id: revisionId,
      projectId: project.id,
      resourceType: "display",
      resourceId: displayId,
      revisionName,
      changeNote,
      sourceHash: hashSource(`${input.html}\n${input.css}\n${input.javascript}`),
      validationStatus: "valid",
      createdBy: actor.userId,
      message,
      metadata: { storageRevisionId: revisionId },
    });
    this.displayCode.upsert({
      displayId,
      projectId: project.id,
      slug: code.slug,
      draftHtml: input.html,
      draftCss: input.css,
      draftJavascript: input.javascript,
      publishedRevisionId: revisionId,
      draftSavedAt: new Date().toISOString(),
      updatedBy: actor.userId,
    });

    const versionTag =
      typeof createdRevision.versionNumber === "number" && createdRevision.versionNumber > 0
        ? `v${createdRevision.versionNumber}`
        : null;

    this.recordProjectActivity(
      project,
      {
        type: "developer-tools.display-published",
        message:
          versionTag && revisionName
            ? `Saved ${versionTag}: ${revisionName}`
            : revisionName
              ? `Display code published: ${revisionName}`
              : "Display code published",
        metadata: {
          displayId,
          revisionId,
          revisionName,
          changeNote,
          versionNumber: createdRevision.versionNumber ?? null,
        },
      },
      actor,
    );

    return { publishedRevisionId: revisionId };
  }

  createDisplay(
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
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new Error("Display name is required.");
    }
    if (trimmedName.length > 120) {
      throw new Error("Display name is too long.");
    }

    const normalizedDescription = input.description?.trim() ?? "";
    if (normalizedDescription.length > MAX_DISPLAY_DESCRIPTION_LENGTH) {
      throw new Error(
        `Display description must be ${MAX_DISPLAY_DESCRIPTION_LENGTH} characters or fewer.`,
      );
    }

    const refreshRateMs = normalizeDisplayRefreshRateMs(5000);
    if (!isAllowedDisplayRefreshRateMs(refreshRateMs)) {
      throw new Error("Unsupported display refresh rate.");
    }

    const displaySize = normalizeDisplaySize(DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT);

    const baseSlug = sanitizeDisplaySlug(
      input.slug?.trim() || generateDisplaySlugFromName(trimmedName),
    );
    const slug = this.resolveUniqueDisplaySlug(project.id, baseSlug);
    const slugIssues = validateDisplaySlug(slug);
    if (slugIssues.some((issue) => issue.severity === "error")) {
      throw new Error(slugIssues[0]?.message ?? "Invalid display slug.");
    }

    const html = input.html?.trim() || BLANK_DISPLAY_HTML;
    const validation = validateDisplaySource({
      html,
      css: "",
      javascript: "",
      slug,
    });
    if (!validation.ok) {
      throw new Error(
        validation.issues.find((issue) => issue.severity === "error")?.message ??
          "Invalid display HTML.",
      );
    }

    const isStandaloneDocument =
      /^<!doctype html/i.test(html) || /^<html[\s>]/i.test(html);

    let createdDisplayId: string | null = null;
    try {
      const display = this.displays.upsert({
        projectId: project.id,
        name: trimmedName,
        displayKey: slug,
        enabled: input.enabled ?? false,
        refreshRateMs,
        displayWidth: displaySize.displayWidth,
        displayHeight: displaySize.displayHeight,
        settings: {
          sourceType: "project-html",
          template: input.template ?? "uploaded-html",
          standaloneDocument: isStandaloneDocument,
          ...(input.uploadedFilename
            ? { uploadedFilename: input.uploadedFilename }
            : {}),
        },
      });
      createdDisplayId = display.id;

      const revisionId = createRevisionId();
      const createdAt = new Date().toISOString();
      const bundle = {
        html,
        css: "",
        javascript: "",
        metadata: {
          template: input.template ?? "uploaded-html",
          revisionId,
          standaloneDocument: isStandaloneDocument,
          ...(input.uploadedFilename
            ? { uploadedFilename: input.uploadedFilename }
            : {}),
        },
      };
      this.storage.writeDisplayPublished(project.id, display.id, bundle);
      this.storage.writeDisplayRevision(project.id, display.id, revisionId, bundle);
      const createdRevision = this.revisions.create({
        id: revisionId,
        projectId: project.id,
        resourceType: "display",
        resourceId: display.id,
        sourceHash: hashSource(`${bundle.html}\n${bundle.css}\n${bundle.javascript}`),
        validationStatus: "valid",
        createdBy: actor.userId,
        message: "Initial uploaded HTML",
        metadata: { storageRevisionId: revisionId },
      });
      this.displayCode.upsert({
        displayId: display.id,
        projectId: project.id,
        slug,
        description: normalizedDescription.length > 0 ? normalizedDescription : null,
        sourceType: "project-html",
        draftHtml: bundle.html,
        draftCss: bundle.css,
        draftJavascript: bundle.javascript,
        publishedRevisionId: revisionId,
        archived: false,
        archivedAt: null,
        archivedByUserId: null,
        updatedBy: actor.userId,
      });

      this.onDisplayCreated?.({
        projectId: project.id,
        displayId: display.id,
      });

      this.displaySyncHooks.queueOperation?.({
        operationType: "display.create",
        entityType: "display",
        entityId: display.id,
        payload: { projectId: project.id, revisionId },
      });
      this.displaySyncHooks.queueOperation?.({
        operationType: "display.revision.create",
        entityType: "display_revision",
        entityId: revisionId,
        payload: { displayId: display.id, projectId: project.id },
      });

      this.recordProjectActivity(
        project,
        {
          type: "developer-tools.display-created",
          message: `Created display "${display.name}" from uploaded HTML.`,
          metadata: { displayId: display.id, slug },
        },
        actor,
      );

      const localUrl = this.buildDisplayViewerUrl(project.id, slug);
      return {
        display: {
          id: display.id,
          projectId: project.id,
          name: display.name,
          slug,
          displayKey: display.displayKey,
          description: normalizedDescription.length > 0 ? normalizedDescription : null,
          sourceType: "project-html" as const,
          enabled: display.enabled,
          archived: false,
          refreshRateMs: display.refreshRateMs,
          displayWidth: display.displayWidth,
          displayHeight: display.displayHeight,
          publishedRevisionId: revisionId,
          activeVersion: {
            id: revisionId,
            versionNumber: createdRevision.versionNumber ?? 1,
            createdAt,
          },
        },
        localUrl,
      };
    } catch (error) {
      if (createdDisplayId) {
        this.displays.deleteById(createdDisplayId);
      }
      throw error;
    }
  }

  reorderDisplays(projectSlug: string, displayKeys: string[]) {
    const project = this.requireProject(projectSlug);
    this.assertDeveloperToolsAccess(project.id);
    const known = new Set(
      this.displays.listByProject(project.id).map((row) => row.displayKey),
    );
    const ordered = displayKeys.filter((key) => known.has(key));
    if (ordered.length === 0) {
      throw new Error("No valid displays were provided.");
    }
    this.displays.reorderProjectDisplays(project.id, ordered);
    return { ok: true };
  }

  renameDisplay(
    projectSlug: string,
    displayId: string,
    input: { name: string },
  ) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new Error("Display name is required.");
    }
    if (trimmedName.length > 120) {
      throw new Error("Display name is too long.");
    }

    const display = this.displays.listByProject(project.id).find((row) => row.id === displayId);
    if (!display) {
      throw new Error("Display not found.");
    }

    const previousName = display.name;
    const updated = this.displays.updateName(displayId, trimmedName);
    if (!updated) {
      throw new Error("Display not found.");
    }

    const code = this.displayCode.getByDisplayId(displayId);
    if (code) {
      this.displayCode.upsert({
        ...code,
        updatedBy: actor.userId,
      });
    }

    this.recordProjectActivity(
      project,
      {
        type: "developer-tools.display-renamed",
        message: "Display renamed",
        metadata: {
          displayId,
          previousName,
          nextName: trimmedName,
        },
      },
      actor,
    );

    return {
      id: updated.id,
      name: updated.name,
      slug: code?.slug ?? display.displayKey,
      displayKey: display.displayKey,
    };
  }

  updateDisplayDetails(
    projectSlug: string,
    displayIdOrKey: string,
    input: { name?: string; description?: string | null },
  ) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const display = this.resolveDisplayRecord(project.id, displayIdOrKey);
    if (!display) {
      throw new Error("Display not found.");
    }

    const code = this.displayCode.getByDisplayId(display.id);
    if (!code) {
      throw new Error("Display code has not been initialized.");
    }

    let nextName = display.name;
    if (input.name !== undefined) {
      const trimmedName = input.name.trim();
      if (!trimmedName) {
        throw new Error("Display name is required.");
      }
      if (trimmedName.length > 120) {
        throw new Error("Display name is too long.");
      }
      const updated = this.displays.updateName(display.id, trimmedName);
      if (!updated) {
        throw new Error("Display not found.");
      }
      nextName = updated.name;
    }

    let nextDescription = code.description;
    if (input.description !== undefined) {
      const normalizedDescription = input.description?.trim() ?? "";
      if (normalizedDescription.length > MAX_DISPLAY_DESCRIPTION_LENGTH) {
        throw new Error(
          `Display description must be ${MAX_DISPLAY_DESCRIPTION_LENGTH} characters or fewer.`,
        );
      }
      nextDescription = normalizedDescription.length > 0 ? normalizedDescription : null;
    }

    this.displayCode.upsert({
      ...code,
      description: nextDescription,
      updatedBy: actor.userId,
    });

    this.recordProjectActivity(
      project,
      {
        type: "developer-tools.display-details-updated",
        message: `Updated display details for "${nextName}".`,
        metadata: {
          displayId: display.id,
          name: nextName,
        },
      },
      actor,
    );

    return {
      id: display.id,
      projectId: project.id,
      name: nextName,
      slug: code.slug,
      displayKey: display.displayKey,
      description: nextDescription,
      enabled: display.enabled,
      archived: code.archived,
      publishedRevisionId: code.publishedRevisionId,
    };
  }

  getOnlineViewerSettings(projectSlug: string, displayIdOrKey: string) {
    const project = this.requireProject(projectSlug);
    this.assertDeveloperToolsAccess(project.id);
    const display = this.resolveDisplayRecord(project.id, displayIdOrKey);
    if (!display) {
      throw new Error("Display not found.");
    }
    const code = this.displayCode.getByDisplayId(display.id);
    if (!code) {
      throw new Error("Display code has not been initialized.");
    }
    return {
      onlineViewerEnabled: code.onlineViewerEnabled,
      onlineVisibility: code.onlineVisibility,
      onlinePublishedAt: code.onlinePublishedAt,
      onlinePublishError: code.onlinePublishError,
    };
  }

  updateOnlineViewerSettings(
    projectSlug: string,
    displayIdOrKey: string,
    input: {
      onlineViewerEnabled?: boolean;
      onlineVisibility?: "private" | "public";
    },
  ) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const display = this.resolveDisplayRecord(project.id, displayIdOrKey);
    if (!display) {
      throw new Error("Display not found.");
    }
    const code = this.displayCode.getByDisplayId(display.id);
    if (!code) {
      throw new Error("Display code has not been initialized.");
    }

    const wasEnabled = code.onlineViewerEnabled;
    const wasVisibility = code.onlineVisibility;

    const nextEnabled =
      input.onlineViewerEnabled !== undefined
        ? input.onlineViewerEnabled
        : code.onlineViewerEnabled;
    const nextVisibility = input.onlineVisibility ?? code.onlineVisibility;

    if (nextEnabled && !display.enabled) {
      throw new Error("Enable the display before turning on Online Viewer.");
    }

    this.displayCode.upsert({
      ...code,
      onlineViewerEnabled: nextEnabled,
      onlineVisibility: nextVisibility,
      onlinePublishedAt: nextEnabled ? code.onlinePublishedAt : null,
      onlinePublishedRevisionId: nextEnabled ? code.onlinePublishedRevisionId : null,
      onlinePublishError: null,
      updatedBy: actor.userId,
    });
    this.displays.markSyncPending(display.id);

    this.displaySyncHooks.queueOperation?.({
      operationType: "display.update",
      entityType: "display",
      entityId: display.id,
      payload: { projectId: project.id },
    });

    if (nextEnabled && code.publishedRevisionId) {
      this.displaySyncHooks.queueOperation?.({
        operationType: "display.revision.create",
        entityType: "display_revision",
        entityId: code.publishedRevisionId,
        payload: { projectId: project.id, displayId: display.id },
      });
    }

    this.displaySyncHooks.syncNow?.("online-viewer");
    this.displaySyncHooks.reconcileProjectPublishing?.(project.id);

    const activityMetadata = {
      displayId: display.id,
      displaySlug: display.displayKey,
      onlineVisibility: nextVisibility,
    };

    if (nextEnabled && !wasEnabled) {
      this.recordProjectActivity(
        project,
        {
          type: "display.online_viewer_enabled",
          message: `Online Viewer enabled for "${display.name}".`,
          metadata: activityMetadata,
        },
        actor,
      );
    } else if (!nextEnabled && wasEnabled) {
      this.recordProjectActivity(
        project,
        {
          type: "display.online_viewer_disabled",
          message: `Online Viewer disabled for "${display.name}".`,
          metadata: activityMetadata,
        },
        actor,
      );
    } else if (
      nextEnabled &&
      wasEnabled &&
      input.onlineVisibility !== undefined &&
      nextVisibility !== wasVisibility
    ) {
      this.recordProjectActivity(
        project,
        {
          type: "display.online_visibility_changed",
          message: `Changed online visibility for "${display.name}" to ${nextVisibility}.`,
          metadata: {
            ...activityMetadata,
            previousVisibility: wasVisibility,
          },
        },
        actor,
      );
    }

    const updated = this.displayCode.getByDisplayId(display.id)!;
    return {
      onlineViewerEnabled: updated.onlineViewerEnabled,
      onlineVisibility: updated.onlineVisibility,
      onlinePublishedAt: updated.onlinePublishedAt,
      onlinePublishError: updated.onlinePublishError,
    };
  }

  private resolveUniqueDisplaySlug(projectId: string, baseSlug: string): string {
    let candidate = baseSlug;
    let suffix = 2;
    while (this.displayCode.getBySlug(projectId, candidate)) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  private resolveUniqueCopyName(projectId: string, sourceName: string): string {
    const baseName = `${sourceName.trim()} Copy`.trim();
    const existingNames = new Set(
      this.displays.listByProject(projectId).map((row) => row.name.trim().toLowerCase()),
    );
    if (!existingNames.has(baseName.toLowerCase())) {
      return baseName;
    }
    let suffix = 2;
    while (existingNames.has(`${baseName} ${suffix}`.toLowerCase())) {
      suffix += 1;
    }
    return `${baseName} ${suffix}`;
  }

  private resolveDuplicateSlug(projectId: string, sourceSlug: string, copyName: string): string {
    const preferredBase = sanitizeDisplaySlug(`${sourceSlug}-copy`);
    const nameBase = sanitizeDisplaySlug(generateDisplaySlugFromName(copyName));
    const baseSlug = this.displayCode.getBySlug(projectId, preferredBase)
      ? nameBase
      : preferredBase;
    return this.resolveUniqueDisplaySlug(projectId, baseSlug);
  }

  private buildDisplayViewerUrl(projectId: string, slug: string): string {
    const base = (this.localApiBaseUrl ?? "http://127.0.0.1:3000").replace(/\/$/, "");
    return `${base}/display/${encodeURIComponent(projectId)}/${encodeURIComponent(slug)}?mode=output`;
  }

  duplicateDisplay(
    projectSlug: string,
    displayId: string,
    input: { name?: string; description?: string },
  ) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const sourceDisplay = this.displays.getById(displayId);
    if (!sourceDisplay || sourceDisplay.projectId !== project.id) {
      throw new Error("Display not found.");
    }

    const sourceCode = this.displayCode.getByDisplayId(displayId);
    if (!sourceCode) {
      throw new Error("Display code has not been initialized.");
    }

    const duplicateName = this.resolveUniqueCopyName(
      project.id,
      input.name?.trim() || sourceDisplay.name,
    );
    const slug = this.resolveDuplicateSlug(project.id, sourceCode.slug, duplicateName);
    const slugIssues = validateDisplaySlug(slug);
    if (slugIssues.some((issue) => issue.severity === "error")) {
      throw new Error(slugIssues[0]?.message ?? "Invalid display slug.");
    }

    const published =
      this.storage.readDisplayPublished(project.id, displayId) ??
      ({
        html: sourceCode.draftHtml ?? BLANK_DISPLAY_HTML,
        css: sourceCode.draftCss ?? BLANK_DISPLAY_CSS,
        javascript: sourceCode.draftJavascript ?? BLANK_DISPLAY_JAVASCRIPT,
        metadata: {},
      } as const);

    const display = this.displays.upsert({
      projectId: project.id,
      name: duplicateName,
      displayKey: slug,
      enabled: false,
      refreshRateMs: sourceDisplay.refreshRateMs,
      displayWidth: sourceDisplay.displayWidth,
      displayHeight: sourceDisplay.displayHeight,
      settings: {
        sourceType: "project-html",
        duplicatedFrom: displayId,
      },
    });

    const revisionId = createRevisionId();
    const createdAt = new Date().toISOString();
    const bundle = {
      html: published.html,
      css: published.css,
      javascript: published.javascript,
      metadata: {
        duplicatedFrom: displayId,
        revisionId,
      },
    };
    this.storage.writeDisplayPublished(project.id, display.id, bundle);
    this.storage.writeDisplayRevision(project.id, display.id, revisionId, bundle);
    const createdRevision = this.revisions.create({
      id: revisionId,
      projectId: project.id,
      resourceType: "display",
      resourceId: display.id,
      sourceHash: hashSource(`${bundle.html}\n${bundle.css}\n${bundle.javascript}`),
      validationStatus: "valid",
      createdBy: actor.userId,
      message: `Duplicated from ${sourceDisplay.name}`,
      metadata: { storageRevisionId: revisionId },
    });
    this.displayCode.upsert({
      displayId: display.id,
      projectId: project.id,
      slug,
      description: input.description ?? sourceCode.description,
      sourceType: "project-html",
      draftHtml: bundle.html,
      draftCss: bundle.css,
      draftJavascript: bundle.javascript,
      publishedRevisionId: revisionId,
      archived: false,
      archivedAt: null,
      archivedByUserId: null,
      updatedBy: actor.userId,
    });

    this.onDisplayDuplicated?.({
      projectId: project.id,
      sourceDisplayId: displayId,
      displayId: display.id,
    });

    this.displaySyncHooks.queueOperation?.({
      operationType: "display.create",
      entityType: "display",
      entityId: display.id,
      payload: { projectId: project.id, revisionId, duplicatedFrom: displayId },
    });
    this.displaySyncHooks.queueOperation?.({
      operationType: "display.revision.create",
      entityType: "display_revision",
      entityId: revisionId,
      payload: { displayId: display.id, projectId: project.id },
    });

    this.recordProjectActivity(
      project,
      {
        type: "developer-tools.display-created",
        message: `Duplicated display "${sourceDisplay.name}" as "${display.name}".`,
        metadata: { displayId: display.id, duplicatedFrom: displayId },
      },
      actor,
    );

    return {
      display: {
        id: display.id,
        projectId: project.id,
        name: display.name,
        slug,
        displayKey: display.displayKey,
        description: input.description ?? sourceCode.description,
        sourceType: "project-html" as const,
        enabled: false,
        archived: false,
        refreshRateMs: display.refreshRateMs,
        displayWidth: display.displayWidth,
        displayHeight: display.displayHeight,
        publishedRevisionId: revisionId,
        activeVersion: {
          id: revisionId,
          versionNumber: createdRevision.versionNumber ?? 1,
          createdAt,
        },
      },
      localUrl: this.buildDisplayViewerUrl(project.id, slug),
    };
  }

  setDisplayEnabled(projectSlug: string, displayId: string, enabled: boolean) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const display = this.displays.getById(displayId);
    if (!display || display.projectId !== project.id) {
      throw new Error("Display not found.");
    }

    const code = this.displayCode.getByDisplayId(displayId);
    const previousEnabled = display.enabled;
    const previousOnlineViewer = code?.onlineViewerEnabled ?? false;
    let onlineViewerWasDisabled = false;

    try {
      const updated = this.displays.setEnabled(displayId, enabled);
      if (!updated) {
        throw new Error("Display not found.");
      }

      if (!enabled && code?.onlineViewerEnabled) {
        this.displayCode.upsert({
          ...code,
          onlineViewerEnabled: false,
          onlinePublishedAt: null,
          onlinePublishedRevisionId: null,
          onlinePublishError: null,
          updatedBy: actor.userId,
        });
        onlineViewerWasDisabled = true;
      }

      this.displays.markSyncPending(displayId);
      this.displaySyncHooks.queueOperation?.({
        operationType: "display.update",
        entityType: "display",
        entityId: displayId,
        payload: { projectId: project.id },
      });
      this.displaySyncHooks.syncNow?.("display-enabled");
      if (!enabled) {
        this.displaySyncHooks.reconcileProjectPublishing?.(project.id);
      }

      const displaySlug = code?.slug ?? display.displayKey;
      if (enabled) {
        this.recordProjectActivity(
          project,
          {
            type: "display.enabled",
            message: `Display enabled for "${display.name}".`,
            metadata: {
              displayId,
              displaySlug,
            },
          },
          actor,
        );
      } else {
        this.recordProjectActivity(
          project,
          {
            type: "display.disabled",
            message: `Display disabled for "${display.name}".`,
            metadata: {
              displayId,
              displaySlug,
            },
          },
          actor,
        );
        if (onlineViewerWasDisabled) {
          this.recordProjectActivity(
            project,
            {
              type: "display.online_viewer_disabled",
              message: `Online Viewer disabled for "${display.name}".`,
              metadata: {
                displayId,
                displaySlug,
              },
            },
            actor,
          );
        }
      }

      const nextCode = this.displayCode.getByDisplayId(displayId);
      return {
        enabled: updated.enabled,
        onlineViewerEnabled: nextCode?.onlineViewerEnabled ?? false,
      };
    } catch (error) {
      if (previousEnabled !== enabled) {
        this.displays.setEnabled(displayId, previousEnabled);
      }
      if (code && onlineViewerWasDisabled && !enabled) {
        this.displayCode.upsert({
          ...code,
          onlineViewerEnabled: previousOnlineViewer,
          updatedBy: actor.userId,
        });
      }
      throw error;
    }
  }

  reconcileInvalidDisplayOnlineStates(projectId: string) {
    let reconciled = 0;
    for (const display of this.displays.listByProject(projectId)) {
      if (display.deletedAt || display.enabled) {
        continue;
      }
      const code = this.displayCode.getByDisplayId(display.id);
      if (!code?.onlineViewerEnabled) {
        continue;
      }

      this.displayCode.upsert({
        ...code,
        onlineViewerEnabled: false,
        onlinePublishedAt: null,
        onlinePublishedRevisionId: null,
        onlinePublishError: null,
        updatedBy: code.updatedBy,
      });
      this.displays.markSyncPending(display.id);
      this.displaySyncHooks.queueOperation?.({
        operationType: "display.update",
        entityType: "display",
        entityId: display.id,
        payload: { projectId },
      });
      reconciled += 1;
    }

    if (reconciled > 0) {
      this.displaySyncHooks.syncNow?.("reconcile-display-online");
      this.displaySyncHooks.reconcileProjectPublishing?.(projectId);
    }

    return { reconciled };
  }

  archiveDisplay(projectSlug: string, displayId: string) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const display = this.displays.getById(displayId);
    if (!display || display.projectId !== project.id) {
      throw new Error("Display not found.");
    }

    const code = this.displayCode.getByDisplayId(displayId);
    if (!code) {
      throw new Error("Display code has not been initialized.");
    }

    const archivedAt = new Date().toISOString();
    this.displays.setEnabled(displayId, false);
    this.displayCode.upsert({
      displayId,
      projectId: project.id,
      slug: code.slug,
      archived: true,
      archivedAt,
      archivedByUserId: actor.userId,
      updatedBy: actor.userId,
    });

    this.displaySyncHooks.queueOperation?.({
      operationType: "display.archive",
      entityType: "display",
      entityId: displayId,
      payload: { projectId: project.id, archivedAt },
    });

    this.recordProjectActivity(
      project,
      {
        type: "developer-tools.display-archived",
        message: `Archived display "${display.name}".`,
        metadata: { displayId },
      },
      actor,
    );

    return { archived: true, displayId, archivedAt };
  }

  unarchiveDisplay(projectSlug: string, displayId: string) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const display = this.displays.getById(displayId);
    if (!display || display.projectId !== project.id) {
      throw new Error("Display not found.");
    }

    const code = this.displayCode.getByDisplayId(displayId);
    if (!code) {
      throw new Error("Display code has not been initialized.");
    }
    if (!code.archived) {
      throw new Error("Display is not archived.");
    }

    this.displays.setEnabled(displayId, false);
    this.displayCode.upsert({
      displayId,
      projectId: project.id,
      slug: code.slug,
      archived: false,
      archivedAt: null,
      archivedByUserId: null,
      updatedBy: actor.userId,
    });

    this.onDisplayUnarchived?.({
      projectId: project.id,
      displayId,
    });

    this.displaySyncHooks.queueOperation?.({
      operationType: "display.unarchive",
      entityType: "display",
      entityId: displayId,
      payload: { projectId: project.id },
    });

    this.recordProjectActivity(
      project,
      {
        type: "developer-tools.display-unarchived",
        message: `Unarchived display "${display.name}".`,
        metadata: { displayId },
      },
      actor,
    );

    return {
      display: {
        id: display.id,
        name: display.name,
        slug: code.slug,
        enabled: false,
        archived: false,
      },
    };
  }

  deleteDisplay(projectSlug: string, displayId: string) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    if (this.displaySyncHooks.isDeleted?.(displayId)) {
      throw new Error("Display has already been deleted.");
    }
    const display = this.displays.getById(displayId);
    if (!display || display.projectId !== project.id) {
      throw new Error("Display not found.");
    }

    const code = this.displayCode.getByDisplayId(displayId);
    if (
      PROTECTED_DISPLAY_KEYS.has(display.displayKey)
    ) {
      throw new Error(
        "Built-in displays cannot be permanently deleted. Archive or disable the display instead.",
      );
    }

    this.displaySyncHooks.recordDeletion?.({
      displayId,
      projectId: project.id,
      deletedByUserId: actor.userId,
    });

    this.revisions.deleteByResource({
      projectId: project.id,
      resourceType: "display",
      resourceId: displayId,
    });
    this.storage.deleteDisplayTree(project.id, displayId);
    this.displayCode.deleteByDisplayId(displayId);
    this.displays.deleteById(displayId);
    this.onDisplayDeleted?.({ projectId: project.id, displayId });

    const activityMessage = code?.archived
      ? `Deleted archived display "${display.name}."`
      : `Deleted display "${display.name}."`;
    this.recordProjectActivity(
      project,
      {
        type: "developer-tools.display-deleted",
        message: activityMessage,
        metadata: { displayId, slug: code?.slug ?? display.displayKey },
      },
      actor,
    );

    return { deleted: true, displayId };
  }

  restoreScraperRevision(
    projectSlug: string,
    revisionId: string,
    input?: { message?: string; revisionName?: string | null; changeNote?: string | null },
  ) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const revision = this.revisions.getById(revisionId);
    if (
      !revision ||
      revision.projectId !== project.id ||
      revision.resourceType !== "scraper"
    ) {
      throw new Error("Revision not found.");
    }

    const storageRevisionId = this.resolveRevisionStorageId(revision);
    const bundle = this.storage.readScraperRevision(project.id, storageRevisionId);
    if (!bundle) {
      throw new Error("Revision source files were not found.");
    }

    const fallbackName = revision.revisionName
      ? `Restore: ${revision.revisionName}`
      : `Restore from ${revisionId.slice(0, 7)}`;

    return this.publishScraper(projectSlug, {
      source: bundle.source,
      revisionName: normalizeRevisionName(input?.revisionName) ?? fallbackName,
      changeNote: normalizeChangeNote(input?.changeNote),
      message: input?.message,
    }).then(async (result) => {
      this.recordProjectActivity(
        project,
        {
          type: "developer-tools.scraper-revision-restored",
          message: "Scraper revision restored",
          metadata: { revisionId },
        },
        actor,
      );
      return result;
    });
  }

  restoreDisplayRevision(
    projectSlug: string,
    displayId: string,
    revisionId: string,
    input?: { message?: string; revisionName?: string | null; changeNote?: string | null },
  ) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const revision = this.revisions.getById(revisionId);
    if (
      !revision ||
      revision.projectId !== project.id ||
      revision.resourceType !== "display" ||
      revision.resourceId !== displayId
    ) {
      throw new Error("Revision not found.");
    }

    const storageRevisionId = this.resolveRevisionStorageId(revision);
    const bundle = this.storage.readDisplayRevision(project.id, displayId, storageRevisionId);
    if (!bundle) {
      throw new Error("Revision source files were not found.");
    }

    const fallbackName = revision.revisionName
      ? `Restore: ${revision.revisionName}`
      : `Restore from ${revisionId.slice(0, 7)}`;

    const result = this.publishDisplay(projectSlug, displayId, {
      html: bundle.html,
      css: bundle.css,
      javascript: bundle.javascript,
      revisionName: normalizeRevisionName(input?.revisionName) ?? fallbackName,
      changeNote: normalizeChangeNote(input?.changeNote),
      message: input?.message,
    });

    this.recordProjectActivity(
      project,
      {
        type: "developer-tools.display-revision-restored",
        message: "Display revision restored",
        metadata: { displayId, revisionId },
      },
      actor,
    );

    return result;
  }

  setActiveDisplayRevision(
    projectSlug: string,
    displayId: string,
    revisionId: string,
  ) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const code = this.displayCode.getByDisplayId(displayId);
    if (!code || code.projectId !== project.id) {
      throw new Error("Display not found.");
    }

    const revision = this.revisions.getById(revisionId);
    if (
      !revision ||
      revision.projectId !== project.id ||
      revision.resourceType !== "display" ||
      revision.resourceId !== displayId
    ) {
      throw new Error("Revision not found.");
    }

    const storageRevisionId = this.resolveRevisionStorageId(revision);
    const bundle = this.storage.readDisplayRevision(
      project.id,
      displayId,
      storageRevisionId,
    );
    if (!bundle) {
      throw new Error("Revision source files were not found.");
    }

    const display = this.displays.getById(displayId);
    const revisionLabel = revision.revisionName?.trim() || revisionId.slice(0, 7);
    const versionTag =
      typeof revision.versionNumber === "number" && revision.versionNumber > 0
        ? `v${revision.versionNumber}`
        : null;
    const now = new Date().toISOString();

    this.storage.writeDisplayPublished(project.id, displayId, {
      ...bundle,
      metadata: {
        ...(bundle.metadata ?? {}),
        revisionId,
        revisionName: revision.revisionName,
        changeNote: revision.changeNote,
        activatedAt: now,
        activatedBy: actor.userId,
      },
    });

    this.displayCode.upsert({
      displayId,
      projectId: project.id,
      slug: code.slug,
      draftHtml: bundle.html,
      draftCss: bundle.css,
      draftJavascript: bundle.javascript,
      publishedRevisionId: revisionId,
      draftSavedAt: now,
      updatedBy: actor.userId,
    });

    this.displays.markSyncPending(displayId);
    this.displaySyncHooks.queueOperation?.({
      operationType: "display.active_revision.update",
      entityType: "display",
      entityId: displayId,
      payload: { projectId: project.id, revisionId },
    });
    this.displaySyncHooks.syncNow?.("display-version-activated");

    if (code.publishedRevisionId !== revisionId) {
      this.recordProjectActivity(
        project,
        {
          type: "developer-tools.display-version-activated",
          message: versionTag
            ? `Activated ${versionTag}`
            : `Activated display version "${revisionLabel}"`,
          metadata: {
            displayId,
            revisionId,
            displayName: display?.name ?? null,
            versionNumber: revision.versionNumber ?? null,
          },
        },
        actor,
      );
    }

    return {
      publishedRevisionId: revisionId,
      html: bundle.html,
      css: bundle.css,
      javascript: bundle.javascript,
    };
  }

  renameDisplayRevision(
    projectSlug: string,
    displayId: string,
    revisionId: string,
    input: { revisionName: string },
  ) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const revision = this.revisions.getById(revisionId);
    if (
      !revision ||
      revision.projectId !== project.id ||
      revision.resourceType !== "display" ||
      revision.resourceId !== displayId
    ) {
      throw new Error("Revision not found.");
    }

    const nextName = normalizeRevisionName(input.revisionName);
    if (!nextName) {
      throw new Error("Version description cannot be empty.");
    }

    const previousName = revision.revisionName?.trim() || revisionId.slice(0, 7);
    if (previousName === nextName) {
      return { revision: { id: revisionId, revisionName: nextName } };
    }

    const updated = this.revisions.updateRevisionName(revisionId, nextName);
    if (!updated) {
      throw new Error("Revision not found.");
    }

    const versionTag =
      typeof revision.versionNumber === "number" && revision.versionNumber > 0
        ? `v${revision.versionNumber}`
        : null;

    this.recordProjectActivity(
      project,
      {
        type: "developer-tools.display-version-renamed",
        message: versionTag
          ? `Renamed ${versionTag} description from "${previousName}" to "${nextName}"`
          : `Renamed display version from "${previousName}" to "${nextName}"`,
        metadata: {
          displayId,
          revisionId,
          previousName,
          nextName,
          versionNumber: revision.versionNumber ?? null,
        },
      },
      actor,
    );

    return {
      revision: {
        id: updated.id,
        revisionName: updated.revisionName,
      },
    };
  }

  deleteDisplayRevision(
    projectSlug: string,
    displayId: string,
    revisionId: string,
  ) {
    const project = this.requireProject(projectSlug);
    const actor = this.assertDeveloperToolsAccess(project.id);
    const code = this.displayCode.getByDisplayId(displayId);
    if (!code) {
      throw new Error("Display not found.");
    }

    const revision = this.revisions.getById(revisionId);
    if (
      !revision ||
      revision.projectId !== project.id ||
      revision.resourceType !== "display" ||
      revision.resourceId !== displayId
    ) {
      throw new Error("Revision not found.");
    }

    if (code.publishedRevisionId === revisionId) {
      throw new Error("The active version cannot be deleted.");
    }

    const remainingRevisions = this.revisions.listForResource({
      projectId: project.id,
      resourceType: "display",
      resourceId: displayId,
      limit: 1000,
    });
    if (remainingRevisions.length <= 1) {
      throw new Error("At least one version must remain.");
    }

    const display = this.displays.getById(displayId);
    const displayName = display?.name?.trim() || code.slug;
    const revisionName = revision.revisionName?.trim() || revisionId.slice(0, 7);
    const versionTag =
      typeof revision.versionNumber === "number" && revision.versionNumber > 0
        ? `v${revision.versionNumber}`
        : null;
    const storageRevisionId = this.resolveRevisionStorageId(revision);

    this.storage.deleteDisplayRevision(project.id, displayId, storageRevisionId);
    const deleted = this.revisions.deleteById(revisionId);
    if (!deleted) {
      throw new Error("Revision not found.");
    }

    this.recordProjectActivity(
      project,
      {
        type: "developer-tools.display-version-deleted",
        message: versionTag
          ? `Deleted ${versionTag} from "${displayName}"`
          : `Deleted display version "${revisionName}" from "${displayName}"`,
        metadata: {
          displayId,
          displayName,
          revisionId,
          revisionName,
          versionNumber: revision.versionNumber ?? null,
        },
      },
      actor,
    );

    return { deletedRevisionId: revisionId };
  }

  describeDisplayViewerLookup(
    projectSegment: string,
    displaySlug: string,
    options?: { preview?: boolean },
  ) {
    return buildDisplayViewerLookupDiagnostic({
      routeProjectSegment: projectSegment,
      routeDisplaySlug: displaySlug,
      previewMode: options?.preview === true,
      projects: this.projects,
      displayCode: this.displayCode,
      displays: this.displays,
      displaySyncHooks: this.displaySyncHooks,
      storage: this.storage,
    });
  }

  private resolveViewerPublishedBundle(
    projectId: string,
    code: {
      displayId: string;
      publishedRevisionId: string | null;
      draftHtml: string | null;
      draftCss: string | null;
      draftJavascript: string | null;
    },
    previewMode: boolean,
  ) {
    const published = this.storage.readDisplayPublished(projectId, code.displayId);
    if (published?.html?.trim()) {
      return published;
    }

    if (!previewMode) {
      return null;
    }

    if (code.publishedRevisionId) {
      const revision = this.storage.readDisplayRevision(
        projectId,
        code.displayId,
        code.publishedRevisionId,
      );
      if (revision?.html?.trim()) {
        return revision;
      }
    }

    if (code.draftHtml?.trim()) {
      return {
        html: code.draftHtml,
        css: code.draftCss ?? "",
        javascript: code.draftJavascript ?? "",
        metadata: {},
      };
    }

    return null;
  }

  resolveProjectForDisplayRoute(projectSegment: string, displaySlug: string) {
    const trimmedProject = projectSegment.trim();
    const trimmedSlug = displaySlug.trim();

    let project =
      this.projects.getById(trimmedProject) ??
      this.projects.getBySlug(trimmedProject) ??
      null;

    if (project && trimmedSlug && this.displayCode.getBySlug(project.id, trimmedSlug)) {
      return project;
    }

    if (trimmedSlug) {
      for (const candidate of this.projects.list()) {
        if (this.displayCode.getBySlug(candidate.id, trimmedSlug)) {
          return candidate;
        }
      }
    }

    return project;
  }

  resolveDisplayViewer(
    projectId: string,
    slug: string,
    options?: { preview?: boolean; output?: boolean },
  ) {
    assertSafeResourceId(projectId, "project ID");
    const project = this.resolveProjectForDisplayRoute(projectId, slug);
    if (!project) {
      return { status: "not_found" as const };
    }
    const resolvedProjectId = project.id;

    const code = this.displayCode.getBySlug(resolvedProjectId, slug);
    if (!code) {
      return { status: "not_found" as const };
    }

    const display = this.displays.getById(code.displayId);
    if (!display) {
      return { status: "not_found" as const };
    }

    if (this.displaySyncHooks.isDeleted?.(code.displayId)) {
      return { status: "not_found" as const };
    }

    if (code.archived) {
      return { status: "disabled" as const, displayName: display.name };
    }

    const previewMode = options?.preview === true;
    const outputMode = options?.output === true;
    if (!previewMode && !outputMode && !display.enabled) {
      return { status: "disabled" as const, displayName: display.name };
    }

    if (!previewMode && !display.enabled && outputMode) {
      return {
        status: "ok" as const,
        html: buildTransparentOutputShellHtml({
          viewportWidth: display.displayWidth,
          viewportHeight: display.displayHeight,
        }),
        displayId: code.displayId,
        projectId: resolvedProjectId,
        slug,
        name: display.name,
      };
    }

    const published = this.resolveViewerPublishedBundle(
      resolvedProjectId,
      code,
      previewMode,
    );
    if (!published) {
      return { status: "not_found" as const };
    }

    const settings =
      display.settings && typeof display.settings === "object" ? display.settings : {};
    const adapterContext = {
      projectId: resolvedProjectId,
      projectSlug: project.slug,
      displayId: code.displayId,
      slug: code.slug,
      displayKey: display.displayKey,
      settings,
      runtimeAdapterKey: resolveDisplayRuntimeAdapterKey({
        projectId: resolvedProjectId,
        projectSlug: project.slug,
        displayId: code.displayId,
        slug: code.slug,
        displayKey: display.displayKey,
        settings,
      }),
    };
    const servedHtml = applyHtmlDisplayRuntimeAdapters(published.html, adapterContext);

    const standalone =
      published.metadata &&
      typeof published.metadata === "object" &&
      (published.metadata as Record<string, unknown>).standaloneDocument === true;

    if (
      standalone ||
      /^<!doctype html/i.test(servedHtml) ||
      /^<html[\s>]/i.test(servedHtml)
    ) {
      const dataUrl = this.buildDisplayDataUrl(resolvedProjectId, slug, previewMode);
      const localApiBase = this.resolveLocalApiBase();
      const pollIntervalMs = normalizeDisplayRefreshRateMs(display.refreshRateMs);
      return {
        status: "ok" as const,
        html: wrapStandaloneDisplayHtml({
          html: servedHtml,
          dataUrl,
          displayInfo: {
            projectId: resolvedProjectId,
            displayId: code.displayId,
            slug,
            name: display.name,
            runtimeAdapterKey: adapterContext.runtimeAdapterKey,
          },
          viewportWidth: display.displayWidth,
          viewportHeight: display.displayHeight,
          localApiBase,
          pollIntervalMs,
          outputMode,
          previewMode,
        }),
        displayId: code.displayId,
        projectId: resolvedProjectId,
        slug,
        name: display.name,
      };
    }

    const dataUrl = this.buildDisplayDataUrl(resolvedProjectId, slug, previewMode);
    const localApiBase = this.resolveLocalApiBase();
    const pollIntervalMs = normalizeDisplayRefreshRateMs(display.refreshRateMs);
    const html = buildDisplayDocument({
      html: servedHtml,
      css: published.css,
      javascript: published.javascript,
      title: display.name,
      dataUrl,
      displayInfo: {
        projectId: resolvedProjectId,
        displayId: code.displayId,
        slug,
        name: display.name,
        runtimeAdapterKey: adapterContext.runtimeAdapterKey,
      },
      viewportWidth: display.displayWidth,
      viewportHeight: display.displayHeight,
      localApiBase,
      pollIntervalMs,
      outputMode,
    });

    return {
      status: "ok" as const,
      html,
      displayId: code.displayId,
      projectId: resolvedProjectId,
      slug,
      name: display.name,
    };
  }

  getDisplayViewerEnabled(projectId: string, slug: string) {
    const project = this.resolveProjectForDisplayRoute(projectId, slug);
    if (!project) {
      throw new Error("Display not found.");
    }
    const code = this.displayCode.getBySlug(project.id, slug);
    if (!code) {
      throw new Error("Display not found.");
    }
    const display = this.displays.getById(code.displayId);
    if (!display) {
      throw new Error("Display not found.");
    }
    return {
      enabled: display.enabled && !code.archived,
      archived: code.archived,
    };
  }

  getDisplayViewerMeta(projectId: string, slug: string) {
    const project = this.resolveProjectForDisplayRoute(projectId, slug);
    if (!project) {
      throw new Error("Display not found.");
    }
    const resolvedProjectId = project.id;
    const code = this.displayCode.getBySlug(resolvedProjectId, slug);
    if (!code) {
      throw new Error("Display not found.");
    }
    const display = this.displays.getById(code.displayId);
    if (!display) {
      throw new Error("Display not found.");
    }

    const projectSlug = project.slug;

    const settings =
      display.settings && typeof display.settings === "object" ? display.settings : {};
    const runtimeAdapterKey = resolveDisplayRuntimeAdapterKey({
      projectId: resolvedProjectId,
      projectSlug,
      displayId: code.displayId,
      slug: code.slug,
      displayKey: display.displayKey,
      settings,
    });

    return {
      enabled: display.enabled && !code.archived,
      archived: code.archived,
      name: display.name,
      slug: code.slug,
      displayId: code.displayId,
      displayKey: display.displayKey,
      displayWidth: display.displayWidth,
      displayHeight: display.displayHeight,
      refreshRateMs: display.refreshRateMs,
      publishedRevisionId: code.publishedRevisionId,
      runtimeAdapterKey,
      settings,
    };
  }

  buildDisplayViewerPath(projectId: string, slug: string) {
    return `/display/${encodeURIComponent(projectId)}/${encodeURIComponent(slug)}`;
  }

  private buildDisplayDataUrl(projectId: string, slug: string, preview = false) {
    const path = `/api/display/${encodeURIComponent(projectId)}/${encodeURIComponent(slug)}/data`;
    return preview ? `${path}?preview=1` : path;
  }

  private resolveLocalApiBase(): string {
    return (this.localApiBaseUrl ?? "http://127.0.0.1:8070").replace(/\/$/, "");
  }

  getRevisionSource(projectSlug: string, revisionId: string) {
    const project = this.requireProject(projectSlug);
    this.assertDeveloperToolsAccess(project.id);
    const revision = this.revisions.getById(revisionId);
    if (!revision || revision.projectId !== project.id) {
      throw new Error("Revision not found.");
    }

    const storageRevisionId = this.resolveRevisionStorageId(revision);
    if (revision.resourceType === "display") {
      const bundle = this.storage.readDisplayRevision(
        project.id,
        revision.resourceId,
        storageRevisionId,
      );
      if (!bundle) {
        throw new Error("Revision source files were not found.");
      }
      return {
        revisionId: revision.id,
        resourceType: revision.resourceType,
        resourceId: revision.resourceId,
        html: bundle.html,
        css: bundle.css,
        javascript: bundle.javascript,
        createdAt: revision.createdAt,
      };
    }

    const bundle = this.storage.readScraperRevision(project.id, storageRevisionId);
    if (!bundle) {
      throw new Error("Revision source files were not found.");
    }

    return {
      revisionId: revision.id,
      resourceType: revision.resourceType,
      resourceId: revision.resourceId,
      source: bundle.source,
      createdAt: revision.createdAt,
    };
  }

  listRevisions(
    projectSlug: string,
    input: { resourceType: "scraper" | "display"; resourceId: string },
  ) {
    const project = this.requireProject(projectSlug);
    this.assertDeveloperToolsAccess(project.id);
    const activeRevisionId =
      input.resourceType === "scraper"
        ? this.scraperCode.get(project.id)?.publishedRevisionId
        : this.displayCode.getByDisplayId(input.resourceId)?.publishedRevisionId;

    return this.revisions
      .listForResource({
        projectId: project.id,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        limit: input.resourceType === "display" ? 500 : 50,
      })
      .map((revision) => ({
        id: revision.id,
        projectId: revision.projectId,
        resourceType: revision.resourceType,
        resourceId: revision.resourceId,
        revisionName: revision.revisionName,
        changeNote: revision.changeNote,
        message: revision.message,
        sourceHash: revision.sourceHash,
        validationStatus: revision.validationStatus,
        versionNumber: revision.versionNumber,
        createdAt: revision.createdAt,
        createdBy: revision.createdBy,
        createdByName:
          typeof revision.metadata.createdByName === "string"
            ? revision.metadata.createdByName
            : null,
        isActive: revision.id === activeRevisionId,
      }));
  }

  private resolveRevisionStorageId(revision: {
    id: string;
    metadata: Record<string, unknown>;
  }): string {
    const storageRevisionId = revision.metadata.storageRevisionId;
    if (typeof storageRevisionId === "string" && storageRevisionId.trim()) {
      return storageRevisionId.trim();
    }
    return revision.id;
  }

  listValidationLogs(projectSlug: string) {
    const project = this.requireProject(projectSlug);
    this.assertDeveloperToolsAccess(project.id);
    return this.validationLogs.listByProject(project.id);
  }

  private recordProjectActivity(
    project: { id: string; slug: string; name: string },
    input: {
      type: string;
      message: string;
      metadata?: Record<string, unknown>;
      source?: string;
    },
    actor?: { userId: string; displayName: string },
  ) {
    this.recordActivity?.({
      ...input,
      actor: actor
        ? { id: actor.userId, name: actor.displayName }
        : { name: "System" },
      metadata: {
        projectId: project.id,
        projectSlug: project.slug,
        projectName: project.name,
        ...(input.metadata ?? {}),
      },
    });
  }

  private requireProject(slug: string) {
    const project = this.projects.getBySlug(slug);
    if (!project) {
      throw new Error("Project not found.");
    }
    return project;
  }

  private async restartProjectScraper(projectId: string) {
    if (!this.engineManager) {
      return;
    }
    const engines = this.dataSources.listByProject(projectId);
    for (const engine of engines) {
      await this.engineManager.restart(engine.id);
    }
  }
}
