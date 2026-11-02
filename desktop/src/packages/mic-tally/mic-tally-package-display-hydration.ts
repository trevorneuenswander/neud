import fs from "fs";
import path from "path";
import { hashRuntimeDisplayBundle } from "../../displays/display-source-content-hash";
import { buildStreamDisplayRevisionName } from "../../displays/broad-arrow-stream-display-specs";
import type { DisplaysRepository } from "../../repositories/displays-repository";
import type { ProjectCodeRevisionsRepository } from "../../repositories/project-code-revisions-repository";
import type { ProjectDisplayCodeRepository } from "../../repositories/project-display-code-repository";
import type { ProjectPackagesRepository } from "../../repositories/project-packages-repository";
import { createRevisionId } from "../../repositories/project-scraper-code-repository";
import type { ProjectCodeStorageService } from "../../services/project-code-storage-service";
import type { ProjectPackageManifest } from "../types";

export type MicTallyDisplayHydrationResult = {
  slug: string;
  created: boolean;
  revisionPublished: boolean;
  displayId: string | null;
  reason?: string;
};

/**
 * Prior packaged Mic Tally UHD HTML content hashes that may be auto-upgraded
 * to the current package HTML. Custom / edited displays (any other hash) are left alone.
 *
 * v1 initial tall-card layout (pre top-row compact redesign):
 * a47319d98440441a37ceaa6f709aff7009fefac31a0ac9e82eba78100ada8cfc
 */
export const MIC_TALLY_UHD_PREVIOUS_PACKAGED_SOURCE_HASHES: ReadonlySet<string> = new Set([
  // Initial tall-card vertical layout
  "a47319d98440441a37ceaa6f709aff7009fefac31a0ac9e82eba78100ada8cfc",
  // Intermediate top-row compact (status column 220px)
  "8fd2ad28dcdbc40f3f5aca29f7923c7f13bc66cd90b49d0d5b5d3039ecdea13c",
]);

/**
 * Registers packaged Mic Tally displays as project display rows.
 */
export class MicTallyPackageDisplayHydration {
  constructor(
    private readonly packages: ProjectPackagesRepository,
    private readonly displays: DisplaysRepository,
    private readonly displayCode: ProjectDisplayCodeRepository,
    private readonly revisions: ProjectCodeRevisionsRepository,
    private readonly storage: ProjectCodeStorageService,
  ) {}

  ensureHydrated(
    projectId: string,
    manifest: ProjectPackageManifest,
    actorUserId = "system",
  ): MicTallyDisplayHydrationResult[] {
    const isMicTally =
      manifest.projectSlug === "mic-tally" || manifest.projectType === "mic-tally";
    if (!isMicTally) {
      return [];
    }
    let install = this.packages.getInstallByProjectId(projectId);
    if (!install?.packageRoot) {
      install = this.packages.getInstallBySlug("mic-tally");
    }
    if (!install?.packageRoot && manifest.projectSlug) {
      install = this.packages.getInstallBySlug(manifest.projectSlug);
    }
    if (!install?.packageRoot) {
      return [];
    }

    return manifest.displays.map((definition) => {
      const runtimeAdapterKey =
        definition.runtimeAdapterKey ?? "mic-tally-three-mics-uhd";
      const importKey = `${runtimeAdapterKey}-v1`;
      const description = `Mic Tally ${definition.name}`;
      const htmlFile = path.join(install.packageRoot, definition.htmlPath);
      if (!fs.existsSync(htmlFile)) {
        return {
          slug: definition.slug,
          created: false,
          revisionPublished: false,
          displayId: null,
          reason: `Package display file missing: ${definition.htmlPath}`,
        };
      }
      const html = fs.readFileSync(htmlFile, "utf8");
      const bundle = { html, css: "", javascript: "" };
      const sourceHash = hashRuntimeDisplayBundle(bundle);
      const settings = {
        sourceType: "project-html",
        template: "uploaded-html",
        standaloneDocument: true,
        importKey,
        graphicType: runtimeAdapterKey,
        runtimeAdapterKey,
        description,
      };

      const existing = this.displayCode.getBySlug(projectId, definition.slug);
      if (existing) {
        const existingDisplay = this.displays.getById(existing.displayId);
        this.displays.upsert({
          projectId,
          name: definition.name,
          displayKey: definition.slug,
          htmlPath: null,
          enabled: existingDisplay?.enabled ?? true,
          refreshRateMs: existingDisplay?.refreshRateMs ?? 1000,
          displayWidth: definition.width,
          displayHeight: definition.height,
          settings,
        });
        const published = this.storage.readDisplayPublished(projectId, existing.displayId);
        const publishedHash = published
          ? hashRuntimeDisplayBundle({
              html: published.html,
              css: published.css ?? "",
              javascript: published.javascript ?? "",
            })
          : null;
        if (publishedHash === sourceHash) {
          return {
            slug: definition.slug,
            created: false,
            revisionPublished: false,
            displayId: existing.displayId,
            reason: "Display already published with the packaged HTML.",
          };
        }
        // Auto-upgrade only when published content still matches a prior packaged revision.
        // User-customized HTML (any other hash) is preserved.
        if (
          publishedHash &&
          MIC_TALLY_UHD_PREVIOUS_PACKAGED_SOURCE_HASHES.has(publishedHash)
        ) {
          this.publishRevision(projectId, existing.displayId, definition.slug, bundle, {
            sourceHash,
            actorUserId,
            importKey,
            description,
            changeNote: "Updated Mic Tally packaged display layout (bundled revision).",
          });
          return {
            slug: definition.slug,
            created: false,
            revisionPublished: true,
            displayId: existing.displayId,
            reason: "Upgraded from prior packaged Mic Tally HTML.",
          };
        }
        return {
          slug: definition.slug,
          created: false,
          revisionPublished: false,
          displayId: existing.displayId,
          reason: "Display already registered; leaving published content unchanged.",
        };
      }

      const display = this.displays.upsert({
        projectId,
        name: definition.name,
        displayKey: definition.slug,
        htmlPath: null,
        enabled: true,
        refreshRateMs: 1000,
        displayWidth: definition.width,
        displayHeight: definition.height,
        settings,
      });
      this.publishRevision(projectId, display.id, definition.slug, bundle, {
        sourceHash,
        actorUserId,
        importKey,
        description,
        changeNote: "Initial Mic Tally display from project package.",
      });
      return {
        slug: definition.slug,
        created: true,
        revisionPublished: true,
        displayId: display.id,
      };
    });
  }

  private publishRevision(
    projectId: string,
    displayId: string,
    slug: string,
    bundle: { html: string; css: string; javascript: string },
    input: {
      sourceHash: string;
      actorUserId: string;
      importKey: string;
      description: string;
      changeNote: string;
    },
  ): void {
    const revisionId = createRevisionId();
    const revisionName = buildStreamDisplayRevisionName(input.importKey);
    const stored = {
      ...bundle,
      metadata: {
        revisionId,
        revisionName,
        changeNote: input.changeNote,
        standaloneDocument: true,
        importKey: input.importKey,
      },
    };
    this.storage.writeDisplayRevision(projectId, displayId, revisionId, stored);
    this.storage.writeDisplayPublished(projectId, displayId, stored);
    this.revisions.create({
      id: revisionId,
      projectId,
      resourceType: "display",
      resourceId: displayId,
      revisionName,
      changeNote: input.changeNote,
      sourceHash: input.sourceHash,
      validationStatus: "valid",
      createdBy: input.actorUserId,
      message: `Published Mic Tally display ${revisionName}`,
      metadata: {
        storageRevisionId: revisionId,
        importKey: input.importKey,
      },
    });
    this.displayCode.upsert({
      displayId,
      projectId,
      slug,
      description: input.description,
      sourceType: "project-html",
      draftHtml: bundle.html,
      draftCss: bundle.css,
      draftJavascript: bundle.javascript,
      publishedRevisionId: revisionId,
      archived: false,
      archivedAt: null,
      archivedByUserId: null,
      updatedBy: input.actorUserId,
    });
  }
}
