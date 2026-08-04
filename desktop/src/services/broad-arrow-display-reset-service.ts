import type { LocalDatabase } from "../database/connection";
import {
  BROAD_ARROW_CANONICAL_PROJECT,
  BROAD_ARROW_DISPLAYS_RESET_SETTING_KEY,
  isBroadArrowCanonicalProject,
} from "../bag/broad-arrow-phase";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";
import type { DisplayDeletionTombstonesRepository } from "../repositories/display-deletion-tombstones-repository";
import type { DisplaySyncQueueRepository } from "../repositories/display-sync-queue-repository";
import type { DisplaysRepository } from "../repositories/displays-repository";
import type { ProjectsRepository } from "../repositories/projects-repository";
import type { ProjectDisplayCodeRepository } from "../repositories/project-display-code-repository";
import type { ProjectCodeRevisionsRepository } from "../repositories/project-code-revisions-repository";
import type { UserDisplayOrderRepository } from "../repositories/user-display-order-repository";
import type { ProjectCodeStorageService } from "./project-code-storage-service";
import type { CloudDisplayClient } from "./display-sync/cloud-display-client";
import { toCloudDisplayTombstoneRow } from "./display-sync/cloud-display-mapper";
import { getOrCreateNeudInstanceId } from "./neud-instance-id";

export type BroadArrowDisplayResetCounts = {
  active: number;
  archived: number;
};

export type BroadArrowDisplayResetResult = {
  projectId: string;
  projectSlug: string;
  removedActive: number;
  removedArchived: number;
  tombstonesCreated: number;
  cloudDisplaysRemoved: number;
  cloudRevisionsRemoved: number;
};

export class BroadArrowDisplayResetService {
  constructor(
    private readonly db: LocalDatabase,
    private readonly projects: ProjectsRepository,
    private readonly displays: DisplaysRepository,
    private readonly displayCode: ProjectDisplayCodeRepository,
    private readonly revisions: ProjectCodeRevisionsRepository,
    private readonly userDisplayOrder: UserDisplayOrderRepository,
    private readonly syncQueue: DisplaySyncQueueRepository,
    private readonly tombstones: DisplayDeletionTombstonesRepository,
    private readonly storage: ProjectCodeStorageService,
    private readonly settings: AppSettingsRepository,
    private readonly cloudClient: CloudDisplayClient | null,
  ) {}

  resolveBroadArrowProject() {
    const project = this.projects.getBySlug(BROAD_ARROW_CANONICAL_PROJECT.slug);
    if (!project || !isBroadArrowCanonicalProject(project)) {
      throw new Error(
        `Reset is restricted to ${BROAD_ARROW_CANONICAL_PROJECT.name} (${BROAD_ARROW_CANONICAL_PROJECT.slug}).`,
      );
    }
    return project;
  }

  countDisplays(projectId: string): BroadArrowDisplayResetCounts {
    const row = this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN COALESCE(pdc.archived, 0) = 0 THEN 1 ELSE 0 END) AS active_count,
           SUM(CASE WHEN COALESCE(pdc.archived, 0) = 1 THEN 1 ELSE 0 END) AS archived_count
         FROM displays d
         LEFT JOIN project_display_code pdc ON pdc.display_id = d.id
         WHERE d.project_id = ?
           AND d.deleted_at IS NULL`,
      )
      .get(projectId) as
      | { active_count: number | string | null; archived_count: number | string | null }
      | undefined;

    return {
      active: Number(row?.active_count ?? 0),
      archived: Number(row?.archived_count ?? 0),
    };
  }

  private listDisplayIds(projectId: string): string[] {
    const rows = this.db
      .prepare(
        `SELECT id FROM displays
         WHERE project_id = ?
           AND deleted_at IS NULL
         ORDER BY created_at ASC`,
      )
      .all(projectId) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  private deleteSyncQueueForDisplays(displayIds: string[]): void {
    if (displayIds.length === 0) {
      return;
    }

    const placeholders = displayIds.map(() => "?").join(", ");
    this.db
      .prepare(
        `DELETE FROM display_sync_queue
         WHERE entity_type = 'display'
           AND entity_id IN (${placeholders})`,
      )
      .run(...displayIds);
  }

  private assertOnlyTargetProject(projectId: string, displayIds: string[]): void {
    for (const displayId of displayIds) {
      const display = this.displays.getById(displayId);
      if (display && display.projectId !== projectId) {
        throw new Error(
          `Safety check failed: display ${displayId} belongs to project ${display.projectId}, not ${projectId}.`,
        );
      }
    }
  }

  async reset(input?: {
    deletedByUserId?: string | null;
    syncCloud?: boolean;
  }): Promise<BroadArrowDisplayResetResult> {
    const project = this.resolveBroadArrowProject();
    const before = this.countDisplays(project.id);
    const displayIds = this.listDisplayIds(project.id);

    console.info(
      `[DisplayReset] Broad Arrow Auctions active=${before.active} archived=${before.archived}`,
    );

    this.assertOnlyTargetProject(project.id, displayIds);

    const instanceId = getOrCreateNeudInstanceId(this.settings);
    let tombstonesCreated = 0;

    for (const displayId of displayIds) {
      if (this.tombstones.isDeleted(displayId)) {
        continue;
      }
      this.tombstones.create({
        displayId,
        projectId: project.id,
        deletedByUserId: input?.deletedByUserId ?? null,
        sourceInstanceId: instanceId,
      });
      tombstonesCreated += 1;
    }

    this.db.transaction(() => {
      this.deleteSyncQueueForDisplays(displayIds);
      this.userDisplayOrder.removeForProject(project.id);

      for (const displayId of displayIds) {
        this.revisions.deleteByResource({
          projectId: project.id,
          resourceType: "display",
          resourceId: displayId,
        });
      }

      for (const displayId of displayIds) {
        this.displayCode.deleteByDisplayId(displayId);
        this.displays.deleteById(displayId);
      }
    });

    for (const displayId of displayIds) {
      this.storage.deleteDisplayTree(project.id, displayId);
    }

    let cloudDisplaysRemoved = 0;
    let cloudRevisionsRemoved = 0;

    if (input?.syncCloud !== false && this.cloudClient) {
      const tombstoneRows = displayIds
        .map((displayId) => this.tombstones.getByDisplayId(displayId))
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .map(toCloudDisplayTombstoneRow);

      if (tombstoneRows.length > 0) {
        const tombstoneResult = await this.cloudClient.upsertTombstones(tombstoneRows);
        if (tombstoneResult.errors.length > 0) {
          throw new Error(tombstoneResult.errors.join("; "));
        }
        const syncedAt = new Date().toISOString();
        for (const row of tombstoneRows) {
          this.tombstones.markSynced(row.display_id, syncedAt);
        }
      }

      const cloudCleanup = await this.cloudClient.removeProjectDisplayData(project.id);
      cloudDisplaysRemoved = cloudCleanup.displays;
      cloudRevisionsRemoved = cloudCleanup.revisions;
    }

    const after = this.countDisplays(project.id);
    if (after.active !== 0 || after.archived !== 0) {
      throw new Error(
        `Display reset incomplete: active=${after.active}, archived=${after.archived}`,
      );
    }

    if (this.cloudClient && input?.syncCloud !== false) {
      const cloudCount = await this.cloudClient.countDisplaysByProject(project.id);
      if (cloudCount > 0) {
        throw new Error(`Cloud display cleanup incomplete: remaining=${cloudCount}`);
      }
    }

    this.settings.set(BROAD_ARROW_DISPLAYS_RESET_SETTING_KEY, true);

    return {
      projectId: project.id,
      projectSlug: project.slug,
      removedActive: before.active,
      removedArchived: before.archived,
      tombstonesCreated,
      cloudDisplaysRemoved,
      cloudRevisionsRemoved,
    };
  }
}
