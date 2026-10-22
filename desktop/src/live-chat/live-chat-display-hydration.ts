import fs from "fs";
import path from "path";
import { hashRuntimeDisplayBundle } from "../displays/display-source-content-hash";
import type { DisplaysRepository } from "../repositories/displays-repository";
import type { ProjectCodeRevisionsRepository } from "../repositories/project-code-revisions-repository";
import type { ProjectDisplayCodeRepository } from "../repositories/project-display-code-repository";
import type { ProjectPackagesRepository } from "../repositories/project-packages-repository";
import { createRevisionId } from "../repositories/project-scraper-code-repository";
import type { ProjectCodeStorageService } from "../services/project-code-storage-service";
import type { ProjectPackageManifest } from "../packages/types";

/**
 * Registers packaged Live Chat Overlay as a project display row.
 * Served via `/api/display/:projectId/live-chat-overlay`.
 */
export class LiveChatDisplayHydration {
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
  ): void {
    const liveChatDisplays = manifest.displays.filter(
      (display) =>
        display.slug === "live-chat-overlay" ||
        display.runtimeAdapterKey === "live-chat-overlay",
    );
    if (liveChatDisplays.length === 0) {
      return;
    }
    const install = this.packages.getInstallByProjectId(projectId);
    if (!install?.packageRoot) {
      return;
    }

    for (const definition of liveChatDisplays) {
      const htmlFile = path.join(install.packageRoot, definition.htmlPath);
      if (!fs.existsSync(htmlFile)) {
        continue;
      }
      const html = fs.readFileSync(htmlFile, "utf8");
      const bundle = { html, css: "", javascript: "" };
      const sourceHash = hashRuntimeDisplayBundle(bundle);
      const settings = {
        sourceType: "project-html",
        template: "uploaded-html",
        standaloneDocument: true,
        importKey: "live-chat-overlay-v1",
        graphicType: "live-chat-overlay",
        runtimeAdapterKey: "live-chat-overlay",
        description: "Live Chat Overlay — current approved on-air message.",
        transparent: true,
      };

      const existing = this.displayCode.getBySlug(projectId, definition.slug);
      if (existing) {
        const published = this.storage.readDisplayPublished(projectId, existing.displayId);
        const publishedHash = published
          ? hashRuntimeDisplayBundle({
              html: published.html,
              css: published.css ?? "",
              javascript: published.javascript ?? "",
            })
          : null;
        if (publishedHash === sourceHash) {
          continue;
        }
        this.publishRevision(projectId, existing.displayId, definition.slug, bundle, {
          sourceHash,
          actorUserId,
        });
        continue;
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
      });
    }
  }

  private publishRevision(
    projectId: string,
    displayId: string,
    slug: string,
    bundle: { html: string; css: string; javascript: string },
    input: { sourceHash: string; actorUserId: string },
  ): void {
    const revisionId = createRevisionId();
    const revisionName = "live-chat-overlay-v1";
    const stored = {
      ...bundle,
      metadata: {
        revisionId,
        revisionName,
        changeNote: "Live Chat Overlay from project package.",
        standaloneDocument: true,
        importKey: "live-chat-overlay-v1",
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
      changeNote: "Live Chat Overlay from project package.",
      sourceHash: input.sourceHash,
      validationStatus: "valid",
      createdBy: input.actorUserId,
      message: `Published Live Chat display ${revisionName}`,
      metadata: {
        storageRevisionId: revisionId,
        importKey: "live-chat-overlay-v1",
      },
    });
    this.displayCode.upsert({
      displayId,
      projectId,
      slug,
      description: "Live Chat Overlay — current approved on-air message.",
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
