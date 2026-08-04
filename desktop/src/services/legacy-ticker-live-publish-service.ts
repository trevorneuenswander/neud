import {
  BROAD_ARROW_CANONICAL_PROJECT,
  isBroadArrowCanonicalProject,
} from "../bag/broad-arrow-phase";
import type { ProjectCodeRevisionsRepository } from "../repositories/project-code-revisions-repository";
import type { ProjectDisplayCodeRepository } from "../repositories/project-display-code-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import {
  isLegacyTickerLiveHtml,
  transformLegacyTickerToLiveBridge,
} from "../displays/legacy-display-v2-transform";
import {
  LEGACY_TICKER_LIVE_CHANGE_NOTE,
  LEGACY_TICKER_LIVE_REVISION_NAME,
} from "../displays/legacy-ticker-live-revision";
import type { ProjectCodeStorageService } from "./project-code-storage-service";
import { createRevisionId, hashSource } from "../repositories/project-scraper-code-repository";

export type LegacyTickerLivePublishResult = {
  projectId: string;
  displayId: string;
  slug: string;
  previousRevisionId: string | null;
  revisionId: string;
  revisionName: string;
  versionNumber: number;
  skipped: boolean;
  reason?: string;
};

export class LegacyTickerLivePublishService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly displayCode: ProjectDisplayCodeRepository,
    private readonly revisions: ProjectCodeRevisionsRepository,
    private readonly storage: ProjectCodeStorageService,
  ) {}

  publishLegacyTickerLive(input?: {
    projectSlug?: string;
    displaySlug?: string;
    actorUserId?: string | null;
  }): LegacyTickerLivePublishResult {
    const projectSlug = input?.projectSlug ?? BROAD_ARROW_CANONICAL_PROJECT.slug;
    const displaySlug = input?.displaySlug ?? "legacy-ticker";
    const project = this.projects.getBySlug(projectSlug);
    if (!project || !isBroadArrowCanonicalProject(project)) {
      throw new Error(`Project ${projectSlug} was not found.`);
    }

    const code = this.displayCode.getBySlug(project.id, displaySlug);
    if (!code) {
      throw new Error(`Display ${displaySlug} was not found in ${projectSlug}.`);
    }

    const published = this.storage.readDisplayPublished(project.id, code.displayId);
    if (!published) {
      throw new Error(`Display ${displaySlug} has no published HTML revision.`);
    }

    if (
      isLegacyTickerLiveHtml(published.html) &&
      /__NEUD_TICKER_REVISION__/.test(published.html)
    ) {
      const revisions = this.revisions.listForResource({
        projectId: project.id,
        resourceType: "display",
        resourceId: code.displayId,
      });
      const activeRevision = revisions.find(
        (revision) => revision.id === code.publishedRevisionId,
      );
      const versionNumber = activeRevision?.versionNumber ?? 1;

      return {
        projectId: project.id,
        displayId: code.displayId,
        slug: displaySlug,
        previousRevisionId: code.publishedRevisionId,
        revisionId: code.publishedRevisionId ?? "",
        revisionName: activeRevision?.revisionName ?? LEGACY_TICKER_LIVE_REVISION_NAME,
        versionNumber,
        skipped: true,
        reason: "Display HTML is already on the legacy-live ticker bridge.",
      };
    }

    const previousRevisionId = code.publishedRevisionId;
    const liveHtml = transformLegacyTickerToLiveBridge(published.html);

    const revisionId = createRevisionId();
    const revisionName = LEGACY_TICKER_LIVE_REVISION_NAME;
    const changeNote = LEGACY_TICKER_LIVE_CHANGE_NOTE;
    const message = "Published legacy-live ticker with unchanged HTML/CSS and NEUD runtime bridge";

    const actorUserId = input?.actorUserId ?? "system";
    const publishedMetadata =
      published.metadata && typeof published.metadata === "object"
        ? (published.metadata as Record<string, unknown>)
        : {};

    const bundle = {
      html: liveHtml,
      css: published.css ?? "",
      javascript: published.javascript ?? "",
      metadata: {
        revisionId,
        revisionName,
        changeNote,
        publishedBy: actorUserId,
        message,
        standaloneDocument: publishedMetadata.standaloneDocument === true,
        derivedFromRevisionId: previousRevisionId,
      },
    };

    this.storage.writeDisplayRevision(project.id, code.displayId, revisionId, bundle);
    this.storage.writeDisplayPublished(project.id, code.displayId, bundle);
    const createdRevision = this.revisions.create({
      id: revisionId,
      projectId: project.id,
      resourceType: "display",
      resourceId: code.displayId,
      revisionName,
      changeNote,
      sourceHash: hashSource(`${bundle.html}\n${bundle.css}\n${bundle.javascript}`),
      validationStatus: "valid",
      createdBy: actorUserId,
      message,
    });

    this.displayCode.upsert({
      displayId: code.displayId,
      projectId: project.id,
      slug: code.slug,
      publishedRevisionId: revisionId,
      archived: code.archived,
      archivedAt: code.archivedAt,
      archivedByUserId: code.archivedByUserId,
      updatedBy: actorUserId,
    });

    const versionNumber = createdRevision.versionNumber ?? 1;

    return {
      projectId: project.id,
      displayId: code.displayId,
      slug: displaySlug,
      previousRevisionId,
      revisionId,
      revisionName,
      versionNumber,
      skipped: false,
    };
  }
}
