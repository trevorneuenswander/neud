import fs from "node:fs";
import path from "node:path";
import {
  BROAD_ARROW_CANONICAL_PROJECT,
  isBroadArrowCanonicalProject,
} from "../bag/broad-arrow-phase";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import type { DisplaysRepository } from "../repositories/displays-repository";
import type { ProjectCodeRevisionsRepository } from "../repositories/project-code-revisions-repository";
import type { ProjectDisplayCodeRepository } from "../repositories/project-display-code-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import {
  BROAD_ARROW_UPLOADED_DISPLAYS_IMPORT_KEY,
  BROAD_ARROW_UPLOADED_DISPLAY_SPECS,
  rendererKeyForGraphicType,
  type BroadArrowUploadedDisplaySpec,
} from "../displays/broad-arrow-uploaded-display-specs";
import {
  isLegacyPylonV2Html,
  isLegacyTickerLiveHtml,
  transformLegacyTickerToLiveBridge,
  transformUploadedDisplayV1ToV2,
} from "../displays/legacy-display-v2-transform";
import {
  LEGACY_TICKER_LIVE_CHANGE_NOTE,
  LEGACY_TICKER_LIVE_REVISION_NAME,
} from "../displays/legacy-ticker-live-revision";
import type { ProjectCodeStorageService } from "./project-code-storage-service";
import { createRevisionId, hashSource } from "../repositories/project-scraper-code-repository";

export type BroadArrowUploadedDisplayImportResult = {
  slug: string;
  created: boolean;
  v2Published: boolean;
  displayId?: string;
  skipped?: boolean;
  reason?: string;
};

export type BroadArrowUploadedDisplaysImportSummary = {
  projectId: string | null;
  imported: BroadArrowUploadedDisplayImportResult[];
  skippedCount: number;
  createdCount: number;
};

export class BroadArrowUploadedDisplaysImportService {
  constructor(
    private readonly settings: AppSettingsRepository,
    private readonly projects: ProjectsRepository,
    private readonly displays: DisplaysRepository,
    private readonly displayCode: ProjectDisplayCodeRepository,
    private readonly revisions: ProjectCodeRevisionsRepository,
    private readonly storage: ProjectCodeStorageService,
    private readonly repoRoot: string,
  ) {}

  ensureImported(actorUserId = "system"): BroadArrowUploadedDisplaysImportSummary {
    const project = this.projects.getBySlug(BROAD_ARROW_CANONICAL_PROJECT.slug);
    if (!project || !isBroadArrowCanonicalProject(project)) {
      return {
        projectId: null,
        imported: [],
        skippedCount: BROAD_ARROW_UPLOADED_DISPLAY_SPECS.length,
        createdCount: 0,
      };
    }

    const results = BROAD_ARROW_UPLOADED_DISPLAY_SPECS.map((spec) =>
      this.ensureDisplayImported(project.id, spec, actorUserId),
    );

    this.removeRetiredAuctionTickerOverlay(project.id);
    this.ensureRendererKeys(project.id);

    this.settings.set(BROAD_ARROW_UPLOADED_DISPLAYS_IMPORT_KEY, "complete");

    return {
      projectId: project.id,
      imported: results,
      skippedCount: results.filter((result) => result.skipped || !result.created).length,
      createdCount: results.filter((result) => result.created).length,
    };
  }

  private ensureDisplayImported(
    projectId: string,
    spec: BroadArrowUploadedDisplaySpec,
    actorUserId: string,
  ): BroadArrowUploadedDisplayImportResult {
    const existingCode = this.displayCode.getBySlug(projectId, spec.slug);
    if (existingCode) {
      const existingDisplay = this.displays.getById(existingCode.displayId);
      const settings =
        existingDisplay?.settings && typeof existingDisplay.settings === "object"
          ? existingDisplay.settings
          : {};
      const importKey =
        typeof settings.importKey === "string" ? settings.importKey : null;

      if (importKey && importKey !== spec.importKey) {
        return {
          slug: spec.slug,
          created: false,
          v2Published: false,
          displayId: existingCode.displayId,
          skipped: true,
          reason: "Display slug exists with a different import identity.",
        };
      }

      const v2Result = this.ensureV2Published(projectId, existingCode.displayId, spec, actorUserId);
      const legacyLiveResult =
        spec.graphicType === "ticker"
          ? this.ensureLegacyLivePublished(projectId, existingCode.displayId, spec, actorUserId)
          : { published: false, reason: "Not a ticker display." };
      this.ensureRendererKeyForDisplay(existingCode.displayId, spec);
      return {
        slug: spec.slug,
        created: false,
        v2Published: v2Result.published || legacyLiveResult.published,
        displayId: existingCode.displayId,
        skipped: true,
        reason: legacyLiveResult.published ? legacyLiveResult.reason : v2Result.reason,
      };
    }

    const v1Html = this.readBundledV1Html(spec);
    const display = this.displays.upsert({
      projectId,
      name: spec.name,
      displayKey: spec.slug,
      htmlPath: null,
      enabled: true,
      refreshRateMs: 5000,
      displayWidth: spec.displayWidth,
      displayHeight: spec.displayHeight,
      settings: {
        sourceType: "project-html",
        template: "uploaded-html",
        standaloneDocument: true,
        importKey: spec.importKey,
        uploadedFilename: spec.uploadedFilename,
        graphicType: spec.graphicType,
        description: spec.description,
        rendererKey: rendererKeyForGraphicType(spec.graphicType),
        activeRenderer: "typescript",
        htmlSourceVersion: "v1",
        rendererNotes:
          "Active output uses the TypeScript renderer derived from the uploaded HTML source. Original HTML versions remain archived in version history.",
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
        standaloneDocument: true,
        importKey: spec.importKey,
        uploadedFilename: spec.uploadedFilename,
        seeded: true,
      },
    };

    this.storage.writeDisplayRevision(projectId, display.id, v1RevisionId, v1Bundle);
    this.revisions.create({
      id: v1RevisionId,
      projectId,
      resourceType: "display",
      resourceId: display.id,
      revisionName: "v1",
      changeNote: `Imported original upload (${spec.uploadedFilename}).`,
      sourceHash: hashSource(`${v1Bundle.html}\n${v1Bundle.css}\n${v1Bundle.javascript}`),
      validationStatus: "valid",
      createdBy: actorUserId,
      message: `Imported ${spec.name} v1 from uploaded HTML`,
      metadata: { storageRevisionId: v1RevisionId, importKey: spec.importKey },
    });

    const v2Html = transformUploadedDisplayV1ToV2(v1Html, spec.graphicType);
    const v2RevisionId = createRevisionId();
    const v2ChangeNote =
      spec.graphicType === "ticker"
        ? "Legacy ticker live bridge: preserve original HTML/CSS/DOM and subscribe to NEUD runtime data."
        : "NEUD canonical runtime bridge: listens for NEUD_DATA_UPDATE, maps current.* to auctionDisplay fields, and uses shared logo asset path.";
    const v2Bundle = {
      html: v2Html,
      css: "",
      javascript: "",
      metadata: {
        revisionId: v2RevisionId,
        revisionName: "v2",
        changeNote: v2ChangeNote,
        standaloneDocument: true,
        derivedFromRevisionId: v1RevisionId,
        importKey: spec.importKey,
      },
    };

    this.storage.writeDisplayRevision(projectId, display.id, v2RevisionId, v2Bundle);
    this.storage.writeDisplayPublished(projectId, display.id, v2Bundle);
    this.revisions.create({
      id: v2RevisionId,
      projectId,
      resourceType: "display",
      resourceId: display.id,
      revisionName: "v2",
      changeNote: v2ChangeNote,
      sourceHash: hashSource(`${v2Bundle.html}\n${v2Bundle.css}\n${v2Bundle.javascript}`),
      validationStatus: "valid",
      createdBy: actorUserId,
      message: `Published ${spec.name} v2 with NEUD runtime bridge`,
      metadata: {
        storageRevisionId: v2RevisionId,
        derivedFromRevisionId: v1RevisionId,
        importKey: spec.importKey,
      },
    });

    this.displayCode.upsert({
      displayId: display.id,
      projectId,
      slug: spec.slug,
      description: spec.description,
      sourceType: "project-html",
      draftHtml: v2Bundle.html,
      draftCss: v2Bundle.css,
      draftJavascript: v2Bundle.javascript,
      publishedRevisionId: v2RevisionId,
      archived: false,
      archivedAt: null,
      archivedByUserId: null,
      updatedBy: actorUserId,
    });

    if (spec.graphicType === "ticker") {
      this.ensureLegacyLivePublished(projectId, display.id, spec, actorUserId);
    }

    return {
      slug: spec.slug,
      created: true,
      v2Published: true,
      displayId: display.id,
    };
  }

  private ensureLegacyLivePublished(
    projectId: string,
    displayId: string,
    spec: BroadArrowUploadedDisplaySpec,
    actorUserId: string,
  ): { published: boolean; reason?: string } {
    if (spec.graphicType !== "ticker") {
      return { published: false, reason: "Not a ticker display." };
    }

    const code = this.displayCode.getByDisplayId(displayId);
    if (!code) {
      return { published: false, reason: "Display code row missing." };
    }

    const published = this.storage.readDisplayPublished(projectId, displayId);
    if (!published) {
      return { published: false, reason: "Published HTML missing." };
    }

    if (isLegacyTickerLiveHtml(published.html)) {
      return { published: false, reason: "Display already on legacy-live ticker bridge." };
    }

    const sourceRevisionId = code.publishedRevisionId;
    const sourceHtml = transformLegacyTickerToLiveBridge(published.html);

    const liveRevisionId = createRevisionId();

    const liveBundle = {
      html: sourceHtml,
      css: published.css ?? "",
      javascript: published.javascript ?? "",
      metadata: {
        revisionId: liveRevisionId,
        revisionName: LEGACY_TICKER_LIVE_REVISION_NAME,
        changeNote: LEGACY_TICKER_LIVE_CHANGE_NOTE,
        standaloneDocument: true,
        derivedFromRevisionId: sourceRevisionId,
        importKey: spec.importKey,
      },
    };

    this.storage.writeDisplayRevision(projectId, displayId, liveRevisionId, liveBundle);
    this.storage.writeDisplayPublished(projectId, displayId, liveBundle);
    this.revisions.create({
      id: liveRevisionId,
      projectId,
      resourceType: "display",
      resourceId: displayId,
      revisionName: LEGACY_TICKER_LIVE_REVISION_NAME,
      changeNote: LEGACY_TICKER_LIVE_CHANGE_NOTE,
      sourceHash: hashSource(`${liveBundle.html}\n${liveBundle.css}\n${liveBundle.javascript}`),
      validationStatus: "valid",
      createdBy: actorUserId,
      message: `Published ${spec.name} legacy-live with unchanged HTML/CSS and NEUD runtime bridge`,
      metadata: {
        storageRevisionId: liveRevisionId,
        derivedFromRevisionId: sourceRevisionId,
        importKey: spec.importKey,
      },
    });

    this.displayCode.upsert({
      displayId: code.displayId,
      projectId,
      slug: code.slug,
      description: code.description,
      sourceType: code.sourceType,
      draftHtml: liveBundle.html,
      draftCss: liveBundle.css,
      draftJavascript: liveBundle.javascript,
      publishedRevisionId: liveRevisionId,
      archived: code.archived,
      archivedAt: code.archivedAt,
      archivedByUserId: code.archivedByUserId,
      updatedBy: actorUserId,
    });

    return { published: true };
  }

  private ensureV2Published(
    projectId: string,
    displayId: string,
    spec: BroadArrowUploadedDisplaySpec,
    actorUserId: string,
  ): { published: boolean; reason?: string } {
    const code = this.displayCode.getByDisplayId(displayId);
    if (!code) {
      return { published: false, reason: "Display code row missing." };
    }

    const published = this.storage.readDisplayPublished(projectId, displayId);
    if (!published) {
      return { published: false, reason: "Published HTML missing." };
    }

    const alreadyV2 =
      spec.graphicType === "ticker"
        ? isLegacyTickerLiveHtml(published.html)
        : isLegacyPylonV2Html(published.html);

    if (alreadyV2) {
      return {
        published: false,
        reason:
          spec.graphicType === "ticker"
            ? "Display already on legacy-live ticker bridge."
            : "Display already on v2 NEUD runtime bridge.",
      };
    }

    const v1Revision = this.revisions
      .listForResource({
        projectId,
        resourceType: "display",
        resourceId: displayId,
      })
      .find((revision) => revision.revisionName === "v1");

    const v1Bundle =
      (v1Revision
        ? this.storage.readDisplayRevision(projectId, displayId, v1Revision.id)
        : null) ?? published;

    const v1Html = v1Bundle.html;
    const v2Html = transformUploadedDisplayV1ToV2(v1Html, spec.graphicType);
    const v2RevisionId = createRevisionId();
    const v2ChangeNote =
      spec.graphicType === "ticker"
        ? "Legacy ticker live bridge: preserve original HTML/CSS/DOM and subscribe to NEUD runtime data."
        : "NEUD canonical runtime bridge: listens for NEUD_DATA_UPDATE, maps current.* to auctionDisplay fields, and uses shared logo asset path.";

    const v2Bundle = {
      html: v2Html,
      css: "",
      javascript: "",
      metadata: {
        revisionId: v2RevisionId,
        revisionName: "v2",
        changeNote: v2ChangeNote,
        standaloneDocument: true,
        derivedFromRevisionId: v1Revision?.id ?? code.publishedRevisionId,
        importKey: spec.importKey,
      },
    };

    this.storage.writeDisplayRevision(projectId, displayId, v2RevisionId, v2Bundle);
    this.storage.writeDisplayPublished(projectId, displayId, v2Bundle);
    this.revisions.create({
      id: v2RevisionId,
      projectId,
      resourceType: "display",
      resourceId: displayId,
      revisionName: "v2",
      changeNote: v2ChangeNote,
      sourceHash: hashSource(`${v2Bundle.html}\n${v2Bundle.css}\n${v2Bundle.javascript}`),
      validationStatus: "valid",
      createdBy: actorUserId,
      message: `Published ${spec.name} v2 with NEUD runtime bridge`,
      metadata: {
        storageRevisionId: v2RevisionId,
        derivedFromRevisionId: v1Revision?.id ?? code.publishedRevisionId,
        importKey: spec.importKey,
      },
    });

    this.displayCode.upsert({
      displayId: code.displayId,
      projectId,
      slug: code.slug,
      description: code.description,
      sourceType: code.sourceType,
      draftHtml: v2Bundle.html,
      draftCss: v2Bundle.css,
      draftJavascript: v2Bundle.javascript,
      publishedRevisionId: v2RevisionId,
      archived: code.archived,
      archivedAt: code.archivedAt,
      archivedByUserId: code.archivedByUserId,
      updatedBy: actorUserId,
    });

    return { published: true };
  }

  private ensureRendererKeys(projectId: string) {
    for (const spec of BROAD_ARROW_UPLOADED_DISPLAY_SPECS) {
      const code = this.displayCode.getBySlug(projectId, spec.slug);
      if (!code) continue;
      this.ensureRendererKeyForDisplay(code.displayId, spec);
    }
  }

  private ensureRendererKeyForDisplay(
    displayId: string,
    spec: BroadArrowUploadedDisplaySpec,
  ) {
    const display = this.displays.getById(displayId);
    if (!display) return;

    const settings =
      display.settings && typeof display.settings === "object" ? display.settings : {};
    const rendererKey = rendererKeyForGraphicType(spec.graphicType);
    if (
      settings.rendererKey === rendererKey &&
      settings.activeRenderer === "typescript"
    ) {
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
      settings: {
        ...settings,
        rendererKey,
        activeRenderer: "typescript",
        htmlSourceVersion:
          typeof settings.htmlSourceVersion === "string" ? settings.htmlSourceVersion : "v1",
        rendererNotes:
          "Active output uses the TypeScript renderer derived from the uploaded HTML source. Original HTML versions remain archived in version history.",
      },
    });
  }

  private removeRetiredAuctionTickerOverlay(projectId: string): void {
    const retiredSlug = "auction-ticker-overlay";
    const code = this.displayCode.getBySlug(projectId, retiredSlug);
    if (!code) {
      return;
    }

    const display = this.displays.getById(code.displayId);
    const settings =
      display?.settings && typeof display.settings === "object" ? display.settings : {};
    const importKey = typeof settings.importKey === "string" ? settings.importKey : null;
    if (importKey !== "broad-arrow:auction-ticker-overlay:v1") {
      return;
    }

    this.revisions.deleteByResource({
      projectId,
      resourceType: "display",
      resourceId: code.displayId,
    });
    this.storage.deleteDisplayTree(projectId, code.displayId);
    this.displayCode.deleteByDisplayId(code.displayId);
    this.displays.deleteById(code.displayId);
  }

  private readBundledV1Html(spec: BroadArrowUploadedDisplaySpec): string {
    const filename = path.basename(spec.bundledV1RelativePath);
    const candidates = [
      path.join(this.repoRoot, spec.bundledV1RelativePath),
      path.join(this.repoRoot, "displays", "bundled", filename),
      path.join(this.repoRoot, "desktop", "dist", "displays", "bundled", filename),
      path.join(__dirname, "bundled", filename),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, "utf8");
      }
    }

    throw new Error(
      `Bundled display source not found for ${spec.slug} (${spec.bundledV1RelativePath})`,
    );
  }
}
