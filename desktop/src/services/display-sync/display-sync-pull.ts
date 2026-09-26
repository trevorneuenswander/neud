import type { AppPaths } from "../app-paths";
import type { DisplaysRepository } from "../../repositories/displays-repository";
import type { ProjectDisplayCodeRepository } from "../../repositories/project-display-code-repository";
import type { ProjectCodeRevisionsRepository } from "../../repositories/project-code-revisions-repository";
import type { ProjectsRepository } from "../../repositories/projects-repository";
import type { ProjectCodeStorageService } from "../project-code-storage-service";
import type { AuthLicenseManager } from "../auth-license-manager";
import type { DisplaySyncQueueRepository } from "../../repositories/display-sync-queue-repository";
import { appendDisplaySyncLog } from "../runtime-diagnostics-log";
import type {
  CloudDisplayClient,
  CloudDisplayIdentityRow,
  CloudDisplayRevisionRow,
  CloudDisplayRow,
} from "./cloud-display-client";
import { reconcileHostedProjectAndDisplayIdentity } from "./hosted-identity-reconciliation";
import type { AuthenticatedCloudCoordinator } from "../authenticated-cloud-coordinator";
import {
  formatRevisionConflictDiagnostic,
  importCloudDisplayRevision,
} from "./display-revision-cloud-import";
import { reconcilePublishedDisplayContent } from "../../lib/reconcile-published-display-content";

export type DisplaySyncPullResult = {
  displaysExamined: number;
  displaysCreated: number;
  revisionsDownloaded: number;
  revisionsReconciled: number;
  revisionsSkippedIdentical: number;
  revisionsConflictPreserved: number;
  publicationUpdates: number;
  conflicts: number;
};

type PullContext = {
  cloud: AuthenticatedCloudCoordinator;
  cloudClient: CloudDisplayClient;
  projects: ProjectsRepository;
  displays: DisplaysRepository;
  displayCode: ProjectDisplayCodeRepository;
  revisions: ProjectCodeRevisionsRepository;
  storage: ProjectCodeStorageService;
  auth: AuthLicenseManager;
  queue: DisplaySyncQueueRepository;
  paths: AppPaths;
  onDisplaysChanged: () => void;
};

function logPull(paths: AppPaths, message: string): void {
  appendDisplaySyncLog(paths, message);
}

function hydratePublishedDisplayBundleFromActiveRevision(
  ctx: PullContext,
  projectId: string,
  displayId: string,
): void {
  const code = ctx.displayCode.getByDisplayId(displayId);
  if (!code?.publishedRevisionId) {
    return;
  }

  const result = reconcilePublishedDisplayContent({
    projectId,
    displayId,
    publishedRevisionId: code.publishedRevisionId,
    storage: ctx.storage,
    resolveStorageRevisionId: (revisionId) => {
      const revision = ctx.revisions.getById(revisionId);
      if (!revision) {
        return revisionId;
      }
      const storageRevisionId = revision.metadata?.storageRevisionId;
      if (typeof storageRevisionId === "string" && storageRevisionId.trim()) {
        return storageRevisionId.trim();
      }
      return revision.id;
    },
  });

  if (result.status === "repaired") {
    logPull(
      ctx.paths,
      `pull.published.hydrated displayId=${displayId} publishedRevisionId=${code.publishedRevisionId}`,
    );
  } else if (result.status === "missing_revision_bundle") {
    logPull(
      ctx.paths,
      `pull.published.hydration_missing_revision displayId=${displayId} publishedRevisionId=${code.publishedRevisionId}`,
    );
  }
}

function hasPendingActiveRevisionPush(
  queue: DisplaySyncQueueRepository,
  displayId: string,
): boolean {
  return queue.hasPendingOperation(displayId, "display.active_revision.update");
}

function applyPublishedRevisionFromCloud(
  ctx: PullContext,
  displayId: string,
  projectId: string,
  cloudDisplay: CloudDisplayRow,
): boolean {
  const code = ctx.displayCode.getByDisplayId(displayId);
  if (!code) {
    return false;
  }

  const remotePublished =
    cloudDisplay.active_revision_id ?? cloudDisplay.online_published_revision_id ?? null;
  if (!remotePublished) {
    return false;
  }

  const localPublished = code.publishedRevisionId ?? null;
  if (localPublished === remotePublished) {
    return false;
  }

  if (hasPendingActiveRevisionPush(ctx.queue, displayId)) {
    logPull(
      ctx.paths,
      `display.active_revision.pull.skipped_pending displayId=${displayId} localPublished=${localPublished ?? "none"} remotePublished=${remotePublished}`,
    );
    logPull(
      ctx.paths,
      `pull.published.skip displayId=${displayId} reason=pending_local_active_revision_push localPublished=${localPublished ?? "none"} remotePublished=${remotePublished}`,
    );
    return false;
  }

  const display = ctx.displays.getById(displayId);
  if (
    localPublished &&
    display &&
    (display.syncStatus === "pending" || display.syncStatus === "failed")
  ) {
    logPull(
      ctx.paths,
      `pull.published.skip displayId=${displayId} reason=local_display_sync_pending localPublished=${localPublished} remotePublished=${remotePublished}`,
    );
    return false;
  }

  let targetRevisionId = remotePublished;
  const remoteRevisionExists = Boolean(ctx.revisions.getById(remotePublished));
  if (!remoteRevisionExists) {
    logPull(
      ctx.paths,
      `pull.published.unresolved displayId=${displayId} remotePublished=${remotePublished} collisionType=published_revision_missing`,
    );
    return false;
  }

  if (localPublished && ctx.revisions.getById(localPublished)) {
    const localVersion = ctx.revisions.getById(localPublished)?.versionNumber ?? null;
    const remoteVersion = ctx.revisions.getById(remotePublished)?.versionNumber ?? null;
    if (
      localVersion != null &&
      remoteVersion != null &&
      localVersion > remoteVersion &&
      display?.syncStatus !== "synced"
    ) {
      logPull(
        ctx.paths,
        `pull.published.retain_local displayId=${displayId} localPublished=${localPublished} localVersion=${localVersion} remotePublished=${remotePublished} remoteVersion=${remoteVersion}`,
      );
      return false;
    }
  }

  ctx.displayCode.upsert({
    displayId,
    projectId,
    slug: code.slug,
    publishedRevisionId: targetRevisionId,
    onlinePublishedRevisionId:
      cloudDisplay.online_published_revision_id ?? code.onlinePublishedRevisionId,
    onlinePublishedAt: cloudDisplay.online_published_at ?? code.onlinePublishedAt,
    onlineViewerEnabled: cloudDisplay.online_viewer_enabled,
    onlineVisibility: cloudDisplay.online_visibility ?? code.onlineVisibility,
    updatedBy: ctx.auth.getAuthenticatedUser()?.userId ?? null,
  });
  logPull(
    ctx.paths,
    `display.active_revision.pull.applied displayId=${displayId} publishedRevisionId=${targetRevisionId}`,
  );
  return true;
}

async function reconcileCloudDisplay(
  ctx: PullContext,
  projectId: string,
  cloudDisplay: CloudDisplayRow,
): Promise<{
  created: boolean;
  revisionsDownloaded: number;
  revisionsReconciled: number;
  revisionsSkippedIdentical: number;
  revisionsConflictPreserved: number;
  publicationUpdated: boolean;
  conflicts: number;
}> {
  const displayId = cloudDisplay.id;
  let created = false;
  const stats = {
    revisionsDownloaded: 0,
    revisionsReconciled: 0,
    revisionsSkippedIdentical: 0,
    revisionsConflictPreserved: 0,
    conflicts: 0,
  };

  const localRevisionCountBefore = ctx.revisions.countForResource({
    projectId,
    resourceType: "display",
    resourceId: displayId,
  });

  const existingById = ctx.displays.getById(displayId);
  if (!existingById) {
    const existingBySlug = ctx.displayCode.getBySlug(projectId, cloudDisplay.slug);
    if (existingBySlug && existingBySlug.displayId !== displayId) {
      ctx.displays.realignDisplayId(existingBySlug.displayId, displayId);
      logPull(
        ctx.paths,
        `pull.realign displaySlug=${cloudDisplay.slug} localId=${existingBySlug.displayId} hostedId=${displayId} collisionType=display_id_realignment`,
      );
    }
  }

  if (!ctx.displays.getById(displayId)) {
    ctx.displays.insertFromCloud({
      id: displayId,
      projectId,
      name: cloudDisplay.name,
      displayKey: cloudDisplay.slug,
      enabled: cloudDisplay.enabled,
      refreshRateMs: cloudDisplay.refresh_rate_ms,
      displayWidth: cloudDisplay.display_width,
      displayHeight: cloudDisplay.display_height,
      sortOrder: cloudDisplay.sort_order ?? null,
      createdAt: cloudDisplay.created_at,
      updatedAt: cloudDisplay.updated_at,
    });
    ctx.displayCode.upsert({
      displayId,
      projectId,
      slug: cloudDisplay.slug,
      description: cloudDisplay.description,
      sourceType: cloudDisplay.display_type === "built-in" ? "built-in" : "project-html",
      publishedRevisionId: cloudDisplay.active_revision_id,
      onlinePublishedRevisionId: cloudDisplay.online_published_revision_id,
      onlinePublishedAt: cloudDisplay.online_published_at,
      onlineViewerEnabled: cloudDisplay.online_viewer_enabled,
      onlineVisibility: cloudDisplay.online_visibility ?? "private",
      archived: cloudDisplay.is_archived,
      archivedAt: cloudDisplay.archived_at,
      archivedByUserId: cloudDisplay.archived_by_user_id,
      updatedBy: ctx.auth.getAuthenticatedUser()?.userId ?? null,
    });
    created = true;
  } else {
    ctx.displayCode.upsert({
      displayId,
      projectId,
      slug: cloudDisplay.slug,
      description: cloudDisplay.description,
      sourceType: cloudDisplay.display_type === "built-in" ? "built-in" : "project-html",
      onlineViewerEnabled: cloudDisplay.online_viewer_enabled,
      onlineVisibility: cloudDisplay.online_visibility ?? "private",
      updatedBy: ctx.auth.getAuthenticatedUser()?.userId ?? null,
    });
  }

  const code = ctx.displayCode.getByDisplayId(displayId);
  const hostedPublishedRevisionId =
    cloudDisplay.active_revision_id ?? cloudDisplay.online_published_revision_id ?? null;

  const projectMatches = await ctx.cloudClient.fetchDisplaysBySlugInProject({
    projectId,
    slug: cloudDisplay.slug,
    displayType: cloudDisplay.display_type,
    includeDeleted: true,
  });
  const crossProjectMatches = await ctx.cloudClient.fetchDisplaysBySlug({
    slug: cloudDisplay.slug,
    displayType: cloudDisplay.display_type,
    includeDeleted: true,
  });

  const sourceDisplayMap = new Map<string, CloudDisplayIdentityRow>();
  for (const row of [...projectMatches, ...crossProjectMatches]) {
    sourceDisplayMap.set(row.id, row);
  }
  sourceDisplayMap.set(displayId, {
    id: displayId,
    project_id: projectId,
    slug: cloudDisplay.slug,
    display_type: cloudDisplay.display_type,
    deleted_at: cloudDisplay.deleted_at,
    active_revision_id: cloudDisplay.active_revision_id,
    online_published_revision_id: cloudDisplay.online_published_revision_id,
    created_at: cloudDisplay.created_at,
    updated_at: cloudDisplay.updated_at,
  });

  const sourceDisplayIds = [...sourceDisplayMap.keys()];
  const revisionCountsByDisplay: Record<string, number> = {};
  for (const sourceId of sourceDisplayIds) {
    revisionCountsByDisplay[sourceId] = await ctx.cloudClient.countRevisionsForDisplay(sourceId);
  }

  logPull(
    ctx.paths,
    [
      "pull.display.identity",
      `canonicalDisplayId=${displayId}`,
      `slug=${cloudDisplay.slug}`,
      `displayType=${cloudDisplay.display_type}`,
      `matchingHostedDisplays=${sourceDisplayIds.length}`,
      `sourceDisplayIds=${sourceDisplayIds.join(",")}`,
      `revisionCountsByDisplay=${JSON.stringify(revisionCountsByDisplay)}`,
      `activeRevisionLocal=${code?.publishedRevisionId ?? "none"}`,
      `activeRevisionCloud=${hostedPublishedRevisionId ?? "none"}`,
    ].join(" "),
  );

  let cloudRevisions: CloudDisplayRevisionRow[] = [];
  let revisionPageCount = 0;
  try {
    const fetched = await ctx.cloudClient.fetchAllRevisionsForDisplays(sourceDisplayIds);
    cloudRevisions = fetched.revisions;
    revisionPageCount = fetched.pageCount;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logPull(ctx.paths, `pull.revisions.error displayId=${displayId} message=${message}`);
    throw error;
  }

  const reservedVersionNumbers = new Set<number>();
  const actorUserId = ctx.auth.getAuthenticatedUser()?.userId ?? "cloud-sync";

  for (const revision of cloudRevisions) {
    try {
      const result = importCloudDisplayRevision({
        projectId,
        displayId,
        slug: cloudDisplay.slug,
        hostedPublishedRevisionId,
        localPublishedRevisionId: code?.publishedRevisionId ?? null,
        revision,
        revisions: ctx.revisions,
        storage: ctx.storage,
        actorUserId,
        reservedVersionNumbers,
      });

      if (result.diagnostic) {
        logPull(ctx.paths, formatRevisionConflictDiagnostic(result.diagnostic));
      }

      switch (result.outcome.status) {
        case "inserted":
          stats.revisionsDownloaded += 1;
          break;
        case "skipped":
          stats.revisionsSkippedIdentical += 1;
          break;
        case "reconciled":
          stats.revisionsReconciled += 1;
          break;
        case "conflict_preserved":
          stats.revisionsConflictPreserved += 1;
          stats.revisionsDownloaded += 1;
          break;
        case "failed":
          stats.conflicts += 1;
          logPull(
            ctx.paths,
            `pull.revision.failed displayId=${displayId} hostedRevisionId=${revision.id} hostedVersion=${revision.version_number} message=${result.outcome.message}`,
          );
          break;
      }
    } catch (error) {
      stats.conflicts += 1;
      const message = error instanceof Error ? error.message : String(error);
      logPull(
        ctx.paths,
        `pull.revision.error displayId=${displayId} hostedRevisionId=${revision.id} hostedVersion=${revision.version_number} message=${message}`,
      );
    }
  }

  const localRevisionCountAfter = ctx.revisions.countForResource({
    projectId,
    resourceType: "display",
    resourceId: displayId,
  });

  const publicationUpdated = applyPublishedRevisionFromCloud(
    ctx,
    displayId,
    projectId,
    cloudDisplay,
  );

  hydratePublishedDisplayBundleFromActiveRevision(ctx, projectId, displayId);

  logPull(
    ctx.paths,
    [
      "pull.display.complete",
      `displayId=${displayId}`,
      `slug=${cloudDisplay.slug}`,
      `sourceDisplayCount=${sourceDisplayIds.length}`,
      `hostedRevisionCount=${cloudRevisions.length}`,
      `revisionPageCount=${revisionPageCount}`,
      `localRevisionCountBefore=${localRevisionCountBefore}`,
      `inserted=${stats.revisionsDownloaded}`,
      `reconciled=${stats.revisionsReconciled}`,
      `skippedIdentical=${stats.revisionsSkippedIdentical}`,
      `conflictPreserved=${stats.revisionsConflictPreserved}`,
      `localRevisionCountAfter=${localRevisionCountAfter}`,
      `activeRevisionLocal=${code?.publishedRevisionId ?? "none"}`,
      `activeRevisionCloud=${hostedPublishedRevisionId ?? "none"}`,
      `publishedApplied=${publicationUpdated}`,
    ].join(" "),
  );

  return { created, publicationUpdated, ...stats };
}

export async function pullRemoteDisplayHistory(
  ctx: PullContext,
  reason: string,
): Promise<DisplaySyncPullResult> {
  const result: DisplaySyncPullResult = {
    displaysExamined: 0,
    displaysCreated: 0,
    revisionsDownloaded: 0,
    revisionsReconciled: 0,
    revisionsSkippedIdentical: 0,
    revisionsConflictPreserved: 0,
    publicationUpdates: 0,
    conflicts: 0,
  };

  logPull(ctx.paths, `pull.begin reason=${reason}`);

  const projectIds = ctx.projects.list().map((project) => project.id);
  for (const projectId of projectIds) {
    const identity = await reconcileHostedProjectAndDisplayIdentity({
      cloud: ctx.cloud,
      projects: ctx.projects,
      displays: ctx.displays,
      displayCode: ctx.displayCode,
      projectId,
    });
    if (!identity.ok) {
      logPull(
        ctx.paths,
        `pull.skip projectId=${projectId} code=${identity.code} message=${identity.message}`,
      );
      continue;
    }

    const hostedProjectId = identity.projectId;
    let cloudDisplays: CloudDisplayRow[] = [];
    try {
      cloudDisplays = await ctx.cloudClient.fetchFullDisplaysForProject(hostedProjectId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logPull(ctx.paths, `pull.error projectId=${hostedProjectId} message=${message}`);
      continue;
    }

    for (const cloudDisplay of cloudDisplays) {
      result.displaysExamined += 1;
      try {
        const applied = await reconcileCloudDisplay(ctx, hostedProjectId, cloudDisplay);
        if (applied.created) {
          result.displaysCreated += 1;
        }
        result.revisionsDownloaded += applied.revisionsDownloaded;
        result.revisionsReconciled += applied.revisionsReconciled;
        result.revisionsSkippedIdentical += applied.revisionsSkippedIdentical;
        result.revisionsConflictPreserved += applied.revisionsConflictPreserved;
        result.conflicts += applied.conflicts;
        if (applied.publicationUpdated) {
          result.publicationUpdates += 1;
        }
      } catch (error) {
        result.conflicts += 1;
        const message = error instanceof Error ? error.message : String(error);
        logPull(
          ctx.paths,
          `pull.conflict displayId=${cloudDisplay.id} projectId=${hostedProjectId} message=${message}`,
        );
      }
    }
  }

  if (
    result.displaysCreated > 0 ||
    result.revisionsDownloaded > 0 ||
    result.revisionsReconciled > 0 ||
    result.publicationUpdates > 0
  ) {
    ctx.onDisplaysChanged();
  }

  logPull(
    ctx.paths,
    [
      "pull.complete",
      `reason=${reason}`,
      `examined=${result.displaysExamined}`,
      `created=${result.displaysCreated}`,
      `revisions=${result.revisionsDownloaded}`,
      `reconciled=${result.revisionsReconciled}`,
      `skippedIdentical=${result.revisionsSkippedIdentical}`,
      `conflictPreserved=${result.revisionsConflictPreserved}`,
      `published=${result.publicationUpdates}`,
      `conflicts=${result.conflicts}`,
    ].join(" "),
  );

  return result;
}
