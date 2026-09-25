import {
  BROAD_ARROW_CANONICAL_PROJECT,
  isBroadArrowCanonicalProject,
} from "../bag/broad-arrow-phase";
import {
  BROAD_ARROW_STREAM_DISPLAYS_IMPORT_KEY,
  BROAD_ARROW_STREAM_DISPLAY_SPECS,
  buildStreamDisplayRevisionName,
  type BroadArrowStreamDisplaySpec,
} from "../displays/broad-arrow-stream-display-specs";
import {
  hashBundledDisplayContentIdentity,
  hashRuntimeDisplayBundle,
  type DisplayRevisionImportDiagnostics,
} from "../displays/display-source-content-hash";
import {
  transformLedDisplayQuailHtmlForServing,
  transformStreamBidHtmlForServing,
  transformStreamTickerHtmlForServing,
} from "../displays/stream-display-v2-transform";
import { readBundledDisplaySourceFromReference } from "../lib/bundled-display-sources";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import type { DisplaysRepository } from "../repositories/displays-repository";
import type { ProjectCodeRevisionsRepository } from "../repositories/project-code-revisions-repository";
import type { ProjectDisplayCodeRepository } from "../repositories/project-display-code-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import type { ProjectCodeStorageService } from "./project-code-storage-service";
import { createRevisionId } from "../repositories/project-scraper-code-repository";

export type BroadArrowStreamDisplayImportResult = {
  slug: string;
  created: boolean;
  revisionPublished: boolean;
  displayId?: string;
  skipped?: boolean;
  reason?: string;
  diagnostics?: DisplayRevisionImportDiagnostics;
};

export type BroadArrowStreamDisplaysImportSummary = {
  projectId: string | null;
  imported: BroadArrowStreamDisplayImportResult[];
  createdCount: number;
  revisionCount: number;
};

function streamDisplayRevisionPrefix(spec: BroadArrowStreamDisplaySpec): string {
  if (spec.graphicType === "stream-bid") {
    return "stream-bid-v1";
  }
  if (spec.graphicType === "stream-ticker") {
    return "stream-ticker-v1";
  }
  return "led-display-quail-v1";
}

export class BroadArrowStreamDisplaysImportService {
  constructor(
    private readonly settings: AppSettingsRepository,
    private readonly projects: ProjectsRepository,
    private readonly displays: DisplaysRepository,
    private readonly displayCode: ProjectDisplayCodeRepository,
    private readonly revisions: ProjectCodeRevisionsRepository,
    private readonly storage: ProjectCodeStorageService,
    private readonly repoRoot: string,
  ) {}

  ensureImported(actorUserId = "system"): BroadArrowStreamDisplaysImportSummary {
    const project = this.projects.getBySlug(BROAD_ARROW_CANONICAL_PROJECT.slug);
    if (!project || !isBroadArrowCanonicalProject(project)) {
      return {
        projectId: null,
        imported: [],
        createdCount: 0,
        revisionCount: 0,
      };
    }

    const imported = BROAD_ARROW_STREAM_DISPLAY_SPECS.map((spec) =>
      this.ensureDisplayImported(project.id, spec, actorUserId),
    );

    this.settings.set(BROAD_ARROW_STREAM_DISPLAYS_IMPORT_KEY, "complete");

    return {
      projectId: project.id,
      imported,
      createdCount: imported.filter((result) => result.created).length,
      revisionCount: imported.filter((result) => result.revisionPublished).length,
    };
  }

  private ensureDisplayImported(
    projectId: string,
    spec: BroadArrowStreamDisplaySpec,
    actorUserId: string,
  ): BroadArrowStreamDisplayImportResult {
    const bundledHtml = readBundledDisplaySourceFromReference(spec.bundledRelativePath);
    const bundledSourceHash = hashBundledDisplayContentIdentity({
      importKey: spec.importKey,
      bundledHtml,
    });
    const runtimeHtml = this.buildRuntimeHtml(spec, bundledHtml);
    const runtimeSourceHash = hashRuntimeDisplayBundle({
      html: runtimeHtml,
      css: "",
      javascript: "",
    });
    const existingCode = this.displayCode.getBySlug(projectId, spec.slug);

    if (existingCode) {
      const published = this.storage.readDisplayPublished(projectId, existingCode.displayId);
      const publishedHash = published
        ? hashRuntimeDisplayBundle({
            html: published.html,
            css: published.css ?? "",
            javascript: published.javascript ?? "",
          })
        : null;

      const matchingRevision =
        this.revisions.findByResourceAndSourceHash({
          projectId,
          resourceType: "display",
          resourceId: existingCode.displayId,
          sourceHash: bundledSourceHash,
        }) ??
        this.revisions.findByResourceAndSourceHash({
          projectId,
          resourceType: "display",
          resourceId: existingCode.displayId,
          sourceHash: runtimeSourceHash,
        });

      const activeRevision = existingCode.publishedRevisionId
        ? this.revisions.getById(existingCode.publishedRevisionId)
        : null;
      const versionBefore = activeRevision?.versionNumber ?? null;

      const diagnostics: DisplayRevisionImportDiagnostics = {
        bundledSourceHash,
        currentRevisionHash: publishedHash,
        matchingRevisionFound: Boolean(matchingRevision),
        duplicateRevisionDetected: Boolean(matchingRevision),
        duplicateRevisionPrevented: Boolean(matchingRevision),
        newRevisionCreated: false,
        versionBefore,
        versionAfter: activeRevision?.versionNumber ?? versionBefore,
        revisionCreationReason: null,
      };

      if (
        matchingRevision &&
        (publishedHash === runtimeSourceHash || publishedHash === bundledSourceHash)
      ) {
        this.ensureDisplaySettings(existingCode.displayId, spec);
        return {
          slug: spec.slug,
          created: false,
          revisionPublished: false,
          displayId: existingCode.displayId,
          skipped: true,
          reason: "Display already published with current HTML source.",
          diagnostics,
        };
      }

      if (matchingRevision) {
        const storedRevision = this.storage.readDisplayRevision(
          projectId,
          existingCode.displayId,
          matchingRevision.id,
        );
        if (storedRevision) {
          this.storage.writeDisplayPublished(projectId, existingCode.displayId, storedRevision);
          this.displayCode.upsert({
            displayId: existingCode.displayId,
            projectId,
            slug: spec.slug,
            description: spec.description,
            sourceType: "project-html",
            draftHtml: storedRevision.html,
            draftCss: storedRevision.css,
            draftJavascript: storedRevision.javascript,
            publishedRevisionId: matchingRevision.id,
            archived: false,
            archivedAt: null,
            archivedByUserId: null,
            updatedBy: actorUserId,
          });
        }
        this.ensureDisplaySettings(existingCode.displayId, spec);
        diagnostics.versionAfter = matchingRevision.versionNumber ?? versionBefore;
        diagnostics.revisionCreationReason = "reused_matching_revision";
        return {
          slug: spec.slug,
          created: false,
          revisionPublished: false,
          displayId: existingCode.displayId,
          skipped: true,
          reason: "Reused existing display revision with identical content.",
          diagnostics,
        };
      }

      if (publishedHash === runtimeSourceHash) {
        this.ensureDisplaySettings(existingCode.displayId, spec);
        diagnostics.revisionCreationReason = "published_runtime_hash_match";
        return {
          slug: spec.slug,
          created: false,
          revisionPublished: false,
          displayId: existingCode.displayId,
          skipped: true,
          reason: "Display already published with current HTML source.",
          diagnostics,
        };
      }

      const revisionId = createRevisionId();
      const revisionName = buildStreamDisplayRevisionName(streamDisplayRevisionPrefix(spec));
      const bundle = {
        html: runtimeHtml,
        css: "",
        javascript: "",
        metadata: {
          revisionId,
          revisionName,
          changeNote: "Updated Stream display HTML with NEUD runtime bridge.",
          standaloneDocument: true,
          importKey: spec.importKey,
          bundledSourceHash,
        },
      };

      this.storage.writeDisplayRevision(projectId, existingCode.displayId, revisionId, bundle);
      this.storage.writeDisplayPublished(projectId, existingCode.displayId, bundle);
      const createdRevision = this.revisions.create({
        id: revisionId,
        projectId,
        resourceType: "display",
        resourceId: existingCode.displayId,
        revisionName,
        changeNote: bundle.metadata.changeNote,
        sourceHash: bundledSourceHash,
        validationStatus: "valid",
        createdBy: actorUserId,
        message: `Published ${spec.name} ${revisionName}`,
        metadata: {
          storageRevisionId: revisionId,
          importKey: spec.importKey,
          bundledSourceHash,
          runtimeSourceHash,
        },
      });
      this.displayCode.upsert({
        displayId: existingCode.displayId,
        projectId,
        slug: spec.slug,
        description: spec.description,
        sourceType: "project-html",
        draftHtml: bundle.html,
        draftCss: bundle.css,
        draftJavascript: bundle.javascript,
        publishedRevisionId: revisionId,
        archived: false,
        archivedAt: null,
        archivedByUserId: null,
        updatedBy: actorUserId,
      });
      this.ensureDisplaySettings(existingCode.displayId, spec);

      diagnostics.newRevisionCreated = true;
      diagnostics.versionAfter = createdRevision.versionNumber ?? null;
      diagnostics.revisionCreationReason = "bundled_content_changed";

      return {
        slug: spec.slug,
        created: false,
        revisionPublished: true,
        displayId: existingCode.displayId,
        skipped: true,
        reason: "Published updated HTML revision.",
        diagnostics,
      };
    }

    const sortOrder = this.displays.getNextSortOrder(projectId);
    const display = this.displays.upsert({
      projectId,
      name: spec.name,
      displayKey: spec.slug,
      htmlPath: null,
      enabled: true,
      refreshRateMs: 5000,
      displayWidth: spec.displayWidth,
      displayHeight: spec.displayHeight,
      sortOrder,
      settings: this.buildDisplaySettings(spec),
    });

    const revisionId = createRevisionId();
    const revisionName = buildStreamDisplayRevisionName(streamDisplayRevisionPrefix(spec));
    const bundle = {
      html: runtimeHtml,
      css: "",
      javascript: "",
      metadata: {
        revisionId,
        revisionName,
        changeNote: "Initial Stream display HTML with NEUD runtime bridge.",
        standaloneDocument: true,
        importKey: spec.importKey,
        seeded: true,
        bundledSourceHash,
      },
    };

    this.storage.writeDisplayRevision(projectId, display.id, revisionId, bundle);
    this.storage.writeDisplayPublished(projectId, display.id, bundle);
    const createdRevision = this.revisions.create({
      id: revisionId,
      projectId,
      resourceType: "display",
      resourceId: display.id,
      revisionName,
      changeNote: bundle.metadata.changeNote,
      sourceHash: bundledSourceHash,
      validationStatus: "valid",
      createdBy: actorUserId,
      message: `Imported ${spec.name} ${revisionName}`,
      metadata: {
        storageRevisionId: revisionId,
        importKey: spec.importKey,
        bundledSourceHash,
        runtimeSourceHash,
      },
    });
    this.displayCode.upsert({
      displayId: display.id,
      projectId,
      slug: spec.slug,
      description: spec.description,
      sourceType: "project-html",
      draftHtml: bundle.html,
      draftCss: bundle.css,
      draftJavascript: bundle.javascript,
      publishedRevisionId: revisionId,
      archived: false,
      archivedAt: null,
      archivedByUserId: null,
      updatedBy: actorUserId,
    });

    return {
      slug: spec.slug,
      created: true,
      revisionPublished: true,
      displayId: display.id,
      diagnostics: {
        bundledSourceHash,
        currentRevisionHash: null,
        matchingRevisionFound: false,
        duplicateRevisionDetected: false,
        duplicateRevisionPrevented: false,
        newRevisionCreated: true,
        versionBefore: null,
        versionAfter: createdRevision.versionNumber ?? 1,
        revisionCreationReason: "initial_import",
      },
    };
  }

  private buildDisplaySettings(spec: BroadArrowStreamDisplaySpec): Record<string, unknown> {
    return {
      sourceType: "project-html",
      template: "uploaded-html",
      standaloneDocument: true,
      importKey: spec.importKey,
      graphicType: spec.graphicType,
      description: spec.description,
      htmlSourceVersion: "stream-v1",
    };
  }

  private ensureDisplaySettings(displayId: string, spec: BroadArrowStreamDisplaySpec): void {
    const display = this.displays.getById(displayId);
    if (!display) return;

    const settings =
      display.settings && typeof display.settings === "object" ? display.settings : {};
    const nextSettings = {
      ...settings,
      ...this.buildDisplaySettings(spec),
    };

    if ("rendererKey" in nextSettings) {
      delete nextSettings.rendererKey;
    }
    if ("activeRenderer" in nextSettings) {
      delete nextSettings.activeRenderer;
    }

    this.displays.upsert({
      projectId: display.projectId,
      name: spec.name,
      displayKey: display.displayKey,
      htmlPath: display.htmlPath,
      enabled: display.enabled,
      refreshRateMs: display.refreshRateMs,
      displayWidth: spec.displayWidth,
      displayHeight: spec.displayHeight,
      sortOrder: display.sortOrder ?? undefined,
      settings: nextSettings,
    });
  }

  private buildRuntimeHtml(
    spec: BroadArrowStreamDisplaySpec,
    baseHtml?: string,
  ): string {
    const html = baseHtml ?? readBundledDisplaySourceFromReference(spec.bundledRelativePath);
    if (spec.graphicType === "stream-bid") {
      return transformStreamBidHtmlForServing(html);
    }
    if (spec.graphicType === "led-display-quail") {
      return transformLedDisplayQuailHtmlForServing(html);
    }
    return transformStreamTickerHtmlForServing(html);
  }
}
