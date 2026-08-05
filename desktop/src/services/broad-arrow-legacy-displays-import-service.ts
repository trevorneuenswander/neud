import {
  BROAD_ARROW_CANONICAL_PROJECT,
  isBroadArrowCanonicalProject,
} from "../bag/broad-arrow-phase";
import {
  BROAD_ARROW_LEGACY_DISPLAYS_IMPORT_KEY,
  LEGACY_PYLON_SPEC,
  LEGACY_TICKER_SPEC,
  RETIRED_AUCTION_PYLON_IMPORT_KEY,
  RETIRED_AUCTION_PYLON_RENDERER_KEY,
  RETIRED_AUCTION_PYLON_SLUG,
} from "../displays/broad-arrow-legacy-display-specs";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import type { DisplaysRepository } from "../repositories/displays-repository";
import type { ProjectCodeRevisionsRepository } from "../repositories/project-code-revisions-repository";
import type { ProjectDisplayCodeRepository } from "../repositories/project-display-code-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import type { ProjectCodeStorageService } from "./project-code-storage-service";
import { createRevisionId, hashSource } from "../repositories/project-scraper-code-repository";
import { readBundledDisplaySourceFromReference } from "../lib/bundled-display-sources";

export type BroadArrowLegacyDisplayImportResult = {
  slug: string;
  created: boolean;
  displayId?: string;
  skipped?: boolean;
  reason?: string;
};

export type BroadArrowLegacyDisplaysImportSummary = {
  projectId: string | null;
  imported: BroadArrowLegacyDisplayImportResult[];
  retiredAuctionPylonRemoved: boolean;
  createdCount: number;
};

export class BroadArrowLegacyDisplaysImportService {
  constructor(
    private readonly settings: AppSettingsRepository,
    private readonly projects: ProjectsRepository,
    private readonly displays: DisplaysRepository,
    private readonly displayCode: ProjectDisplayCodeRepository,
    private readonly revisions: ProjectCodeRevisionsRepository,
    private readonly storage: ProjectCodeStorageService,
    private readonly repoRoot: string,
  ) {}

  ensureImported(actorUserId = "system"): BroadArrowLegacyDisplaysImportSummary {
    const project = this.projects.getBySlug(BROAD_ARROW_CANONICAL_PROJECT.slug);
    if (!project || !isBroadArrowCanonicalProject(project)) {
      return {
        projectId: null,
        imported: [],
        retiredAuctionPylonRemoved: false,
        createdCount: 0,
      };
    }

    const retiredAuctionPylonRemoved = this.removeRetiredAuctionPylonDisplay(project.id);
    const legacyTickerResult = this.ensureLegacyTickerImported(project.id, actorUserId);
    const legacyPylonResult = this.ensureLegacyPylonImported(project.id, actorUserId);

    this.settings.set(BROAD_ARROW_LEGACY_DISPLAYS_IMPORT_KEY, "complete");

    return {
      projectId: project.id,
      imported: [legacyTickerResult, legacyPylonResult],
      retiredAuctionPylonRemoved,
      createdCount:
        (legacyTickerResult.created ? 1 : 0) + (legacyPylonResult.created ? 1 : 0),
    };
  }

  private ensureLegacyTickerImported(
    projectId: string,
    actorUserId: string,
  ): BroadArrowLegacyDisplayImportResult {
    const spec = LEGACY_TICKER_SPEC;
    const existingCode = this.displayCode.getBySlug(projectId, spec.slug);
    if (existingCode) {
      this.ensureLegacyTickerRuntimeAdapter(existingCode.displayId);
      return {
        slug: spec.slug,
        created: false,
        displayId: existingCode.displayId,
        skipped: true,
        reason: "Legacy Ticker already imported.",
      };
    }

    const v1Html = readBundledDisplaySourceFromReference(spec.bundledV1RelativePath);
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
      settings: {
        sourceType: "project-html",
        template: "uploaded-html",
        standaloneDocument: true,
        importKey: spec.importKey,
        uploadedFilename: spec.uploadedFilename,
        graphicType: "ticker",
        description: spec.description,
        runtimeAdapterKey: spec.runtimeAdapterKey,
      },
    });

    const v1RevisionId = createRevisionId();
    const v1Bundle = {
      html: v1Html,
      css: "",
      javascript: "",
      metadata: {
        revisionId: v1RevisionId,
        revisionName: "legacy-live-v1",
        changeNote: "Imported bundled legacy ticker live HTML",
        standaloneDocument: true,
        importKey: spec.importKey,
        uploadedFilename: spec.uploadedFilename,
        seeded: true,
      },
    };

    this.storage.writeDisplayRevision(projectId, display.id, v1RevisionId, v1Bundle);
    this.storage.writeDisplayPublished(projectId, display.id, v1Bundle);
    this.revisions.create({
      id: v1RevisionId,
      projectId,
      resourceType: "display",
      resourceId: display.id,
      revisionName: "legacy-live-v1",
      changeNote: "Imported bundled legacy ticker live HTML",
      sourceHash: hashSource(`${v1Bundle.html}\n${v1Bundle.css}\n${v1Bundle.javascript}`),
      validationStatus: "valid",
      createdBy: actorUserId,
      message: `Imported ${spec.name} from bundled HTML`,
      metadata: { storageRevisionId: v1RevisionId, importKey: spec.importKey },
    });

    this.displayCode.upsert({
      displayId: display.id,
      projectId,
      slug: spec.slug,
      description: spec.description,
      sourceType: "project-html",
      draftHtml: v1Bundle.html,
      draftCss: v1Bundle.css,
      draftJavascript: v1Bundle.javascript,
      publishedRevisionId: v1RevisionId,
      archived: false,
      archivedAt: null,
      archivedByUserId: null,
      updatedBy: actorUserId,
    });

    return {
      slug: spec.slug,
      created: true,
      displayId: display.id,
    };
  }

  private ensureLegacyTickerRuntimeAdapter(displayId: string): void {
    const display = this.displays.getById(displayId);
    if (!display) return;

    const settings =
      display.settings && typeof display.settings === "object" ? display.settings : {};
    const nextSettings = { ...settings };
    let changed = false;

    if (nextSettings.runtimeAdapterKey !== LEGACY_TICKER_SPEC.runtimeAdapterKey) {
      nextSettings.runtimeAdapterKey = LEGACY_TICKER_SPEC.runtimeAdapterKey;
      changed = true;
    }

    if ("rendererKey" in nextSettings) {
      delete nextSettings.rendererKey;
      changed = true;
    }
    if ("activeRenderer" in nextSettings) {
      delete nextSettings.activeRenderer;
      changed = true;
    }
    if (nextSettings.importKey !== LEGACY_TICKER_SPEC.importKey) {
      nextSettings.importKey = LEGACY_TICKER_SPEC.importKey;
      changed = true;
    }

    if (!changed) return;

    this.displays.upsert({
      projectId: display.projectId,
      name: display.name,
      displayKey: display.displayKey,
      htmlPath: display.htmlPath,
      enabled: display.enabled,
      refreshRateMs: display.refreshRateMs,
      displayWidth: display.displayWidth,
      displayHeight: display.displayHeight,
      sortOrder: display.sortOrder ?? undefined,
      settings: nextSettings,
    });
  }

  private ensureLegacyPylonImported(
    projectId: string,
    actorUserId: string,
  ): BroadArrowLegacyDisplayImportResult {
    const spec = LEGACY_PYLON_SPEC;
    const existingCode = this.displayCode.getBySlug(projectId, spec.slug);
    if (existingCode) {
      this.ensureLegacyPylonRuntimeAdapter(existingCode.displayId);
      this.ensureLegacyPylonSortOrder(projectId, existingCode.displayId);
      return {
        slug: spec.slug,
        created: false,
        displayId: existingCode.displayId,
        skipped: true,
        reason: "Legacy Pylon already imported.",
      };
    }

    const v1Html = readBundledDisplaySourceFromReference(spec.bundledV1RelativePath);
    const sortOrder = this.resolveSortOrderAfterLegacyTicker(projectId);
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
      settings: {
        sourceType: "project-html",
        template: "uploaded-html",
        standaloneDocument: true,
        importKey: spec.importKey,
        uploadedFilename: spec.uploadedFilename,
        graphicType: "pylon",
        description: spec.description,
        runtimeAdapterKey: spec.runtimeAdapterKey,
      },
    });

    const v1RevisionId = createRevisionId();
    const v1Bundle = {
      html: v1Html,
      css: "",
      javascript: "",
      metadata: {
        revisionId: v1RevisionId,
        revisionName: "v1",
        changeNote: "Initial uploaded HTML",
        standaloneDocument: true,
        importKey: spec.importKey,
        uploadedFilename: spec.uploadedFilename,
        seeded: true,
      },
    };

    this.storage.writeDisplayRevision(projectId, display.id, v1RevisionId, v1Bundle);
    this.storage.writeDisplayPublished(projectId, display.id, v1Bundle);
    this.revisions.create({
      id: v1RevisionId,
      projectId,
      resourceType: "display",
      resourceId: display.id,
      revisionName: "v1",
      changeNote: "Initial uploaded HTML",
      sourceHash: hashSource(`${v1Bundle.html}\n${v1Bundle.css}\n${v1Bundle.javascript}`),
      validationStatus: "valid",
      createdBy: actorUserId,
      message: `Imported ${spec.name} v1 from uploaded HTML`,
      metadata: { storageRevisionId: v1RevisionId, importKey: spec.importKey },
    });

    this.displayCode.upsert({
      displayId: display.id,
      projectId,
      slug: spec.slug,
      description: spec.description,
      sourceType: "project-html",
      draftHtml: v1Bundle.html,
      draftCss: v1Bundle.css,
      draftJavascript: v1Bundle.javascript,
      publishedRevisionId: v1RevisionId,
      archived: false,
      archivedAt: null,
      archivedByUserId: null,
      updatedBy: actorUserId,
    });

    return {
      slug: spec.slug,
      created: true,
      displayId: display.id,
    };
  }

  private ensureLegacyPylonRuntimeAdapter(displayId: string): void {
    const display = this.displays.getById(displayId);
    if (!display) return;

    const settings =
      display.settings && typeof display.settings === "object" ? display.settings : {};
    const nextSettings = { ...settings };
    let changed = false;

    if (nextSettings.runtimeAdapterKey !== LEGACY_PYLON_SPEC.runtimeAdapterKey) {
      nextSettings.runtimeAdapterKey = LEGACY_PYLON_SPEC.runtimeAdapterKey;
      changed = true;
    }

    if ("rendererKey" in nextSettings) {
      delete nextSettings.rendererKey;
      changed = true;
    }
    if ("activeRenderer" in nextSettings) {
      delete nextSettings.activeRenderer;
      changed = true;
    }
    if (nextSettings.importKey !== LEGACY_PYLON_SPEC.importKey) {
      nextSettings.importKey = LEGACY_PYLON_SPEC.importKey;
      changed = true;
    }

    if (!changed) return;

    this.displays.upsert({
      projectId: display.projectId,
      name: display.name,
      displayKey: display.displayKey,
      htmlPath: display.htmlPath,
      enabled: display.enabled,
      refreshRateMs: display.refreshRateMs,
      displayWidth: display.displayWidth,
      displayHeight: display.displayHeight,
      sortOrder: display.sortOrder ?? undefined,
      settings: nextSettings,
    });
  }

  private resolveSortOrderAfterLegacyTicker(projectId: string): number {
    const displays = this.displays.listByProject(projectId);
    const legacyTicker = displays.find((display) => display.displayKey === "legacy-ticker");
    if (legacyTicker?.sortOrder != null) {
      return legacyTicker.sortOrder + 1;
    }
    return this.displays.getNextSortOrder(projectId);
  }

  private ensureLegacyPylonSortOrder(projectId: string, displayId: string): void {
    const display = this.displays.getById(displayId);
    if (!display) return;

    const legacyTicker = this.displays
      .listByProject(projectId)
      .find((entry) => entry.displayKey === "legacy-ticker");
    if (legacyTicker?.sortOrder == null) {
      return;
    }

    const desiredOrder = legacyTicker.sortOrder + 1;
    if (display.sortOrder === desiredOrder) {
      return;
    }

    this.displays.upsert({
      projectId: display.projectId,
      name: display.name,
      displayKey: display.displayKey,
      htmlPath: display.htmlPath,
      enabled: display.enabled,
      refreshRateMs: display.refreshRateMs,
      displayWidth: display.displayWidth,
      displayHeight: display.displayHeight,
      sortOrder: desiredOrder,
      settings: display.settings,
    });
  }

  private removeRetiredAuctionPylonDisplay(projectId: string): boolean {
    const code = this.displayCode.getBySlug(projectId, RETIRED_AUCTION_PYLON_SLUG);
    if (!code) {
      return false;
    }

    const display = this.displays.getById(code.displayId);
    const settings =
      display?.settings && typeof display.settings === "object" ? display.settings : {};
    const importKey = typeof settings.importKey === "string" ? settings.importKey : null;
    const rendererKey =
      typeof settings.rendererKey === "string" ? settings.rendererKey : null;

    const matchesRetiredIdentity =
      importKey === RETIRED_AUCTION_PYLON_IMPORT_KEY ||
      rendererKey === RETIRED_AUCTION_PYLON_RENDERER_KEY ||
      code.slug === RETIRED_AUCTION_PYLON_SLUG;

    if (!matchesRetiredIdentity) {
      return false;
    }

    this.revisions.deleteByResource({
      projectId,
      resourceType: "display",
      resourceId: code.displayId,
    });
    this.storage.deleteDisplayTree(projectId, code.displayId);
    this.displayCode.deleteByDisplayId(code.displayId);
    this.displays.deleteById(code.displayId);
    return true;
  }
}
