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
import { createRevisionId, hashSource } from "../repositories/project-scraper-code-repository";

export type BroadArrowStreamDisplayImportResult = {
  slug: string;
  created: boolean;
  revisionPublished: boolean;
  displayId?: string;
  skipped?: boolean;
  reason?: string;
};

export type BroadArrowStreamDisplaysImportSummary = {
  projectId: string | null;
  imported: BroadArrowStreamDisplayImportResult[];
  createdCount: number;
  revisionCount: number;
};

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
    const runtimeHtml = this.buildRuntimeHtml(spec);
    const sourceHash = hashSource(`${runtimeHtml}\n\n`);
    const existingCode = this.displayCode.getBySlug(projectId, spec.slug);

    if (existingCode) {
      const published = this.storage.readDisplayPublished(projectId, existingCode.displayId);
      const publishedHash = published
        ? hashSource(`${published.html}\n${published.css ?? ""}\n${published.javascript ?? ""}`)
        : null;

      if (publishedHash === sourceHash) {
        this.ensureDisplaySettings(existingCode.displayId, spec);
        return {
          slug: spec.slug,
          created: false,
          revisionPublished: false,
          displayId: existingCode.displayId,
          skipped: true,
          reason: "Display already published with current HTML source.",
        };
      }

      const revisionId = createRevisionId();
      const revisionName = buildStreamDisplayRevisionName(
        spec.graphicType === "stream-bid" ? "stream-bid-v1" : "stream-ticker-v1",
      );
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
        },
      };

      this.storage.writeDisplayRevision(projectId, existingCode.displayId, revisionId, bundle);
      this.storage.writeDisplayPublished(projectId, existingCode.displayId, bundle);
      this.revisions.create({
        id: revisionId,
        projectId,
        resourceType: "display",
        resourceId: existingCode.displayId,
        revisionName,
        changeNote: bundle.metadata.changeNote,
        sourceHash,
        validationStatus: "valid",
        createdBy: actorUserId,
        message: `Published ${spec.name} ${revisionName}`,
        metadata: { storageRevisionId: revisionId, importKey: spec.importKey },
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

      return {
        slug: spec.slug,
        created: false,
        revisionPublished: true,
        displayId: existingCode.displayId,
        skipped: true,
        reason: "Published updated HTML revision.",
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
    const revisionName = buildStreamDisplayRevisionName(
      spec.graphicType === "stream-bid" ? "stream-bid-v1" : "stream-ticker-v1",
    );
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
      },
    };

    this.storage.writeDisplayRevision(projectId, display.id, revisionId, bundle);
    this.storage.writeDisplayPublished(projectId, display.id, bundle);
    this.revisions.create({
      id: revisionId,
      projectId,
      resourceType: "display",
      resourceId: display.id,
      revisionName,
      changeNote: bundle.metadata.changeNote,
      sourceHash,
      validationStatus: "valid",
      createdBy: actorUserId,
      message: `Imported ${spec.name} ${revisionName}`,
      metadata: { storageRevisionId: revisionId, importKey: spec.importKey },
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

  private buildRuntimeHtml(spec: BroadArrowStreamDisplaySpec): string {
    const baseHtml = readBundledDisplaySourceFromReference(spec.bundledRelativePath);
    if (spec.graphicType === "stream-bid") {
      return transformStreamBidHtmlForServing(baseHtml);
    }
    return transformStreamTickerHtmlForServing(baseHtml);
  }
}
