"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BroadArrowDisplayResetService = void 0;
const broad_arrow_phase_1 = require("../bag/broad-arrow-phase");
const cloud_display_mapper_1 = require("./display-sync/cloud-display-mapper");
const neud_instance_id_1 = require("./neud-instance-id");
class BroadArrowDisplayResetService {
    db;
    projects;
    displays;
    displayCode;
    revisions;
    userDisplayOrder;
    syncQueue;
    tombstones;
    storage;
    settings;
    cloudClient;
    constructor(db, projects, displays, displayCode, revisions, userDisplayOrder, syncQueue, tombstones, storage, settings, cloudClient) {
        this.db = db;
        this.projects = projects;
        this.displays = displays;
        this.displayCode = displayCode;
        this.revisions = revisions;
        this.userDisplayOrder = userDisplayOrder;
        this.syncQueue = syncQueue;
        this.tombstones = tombstones;
        this.storage = storage;
        this.settings = settings;
        this.cloudClient = cloudClient;
    }
    resolveBroadArrowProject() {
        const project = this.projects.getBySlug(broad_arrow_phase_1.BROAD_ARROW_CANONICAL_PROJECT.slug);
        if (!project || !(0, broad_arrow_phase_1.isBroadArrowCanonicalProject)(project)) {
            throw new Error(`Reset is restricted to ${broad_arrow_phase_1.BROAD_ARROW_CANONICAL_PROJECT.name} (${broad_arrow_phase_1.BROAD_ARROW_CANONICAL_PROJECT.slug}).`);
        }
        return project;
    }
    countDisplays(projectId) {
        const row = this.db
            .prepare(`SELECT
           SUM(CASE WHEN COALESCE(pdc.archived, 0) = 0 THEN 1 ELSE 0 END) AS active_count,
           SUM(CASE WHEN COALESCE(pdc.archived, 0) = 1 THEN 1 ELSE 0 END) AS archived_count
         FROM displays d
         LEFT JOIN project_display_code pdc ON pdc.display_id = d.id
         WHERE d.project_id = ?
           AND d.deleted_at IS NULL`)
            .get(projectId);
        return {
            active: Number(row?.active_count ?? 0),
            archived: Number(row?.archived_count ?? 0),
        };
    }
    listDisplayIds(projectId) {
        const rows = this.db
            .prepare(`SELECT id FROM displays
         WHERE project_id = ?
           AND deleted_at IS NULL
         ORDER BY created_at ASC`)
            .all(projectId);
        return rows.map((row) => row.id);
    }
    deleteSyncQueueForDisplays(displayIds) {
        if (displayIds.length === 0) {
            return;
        }
        const placeholders = displayIds.map(() => "?").join(", ");
        this.db
            .prepare(`DELETE FROM display_sync_queue
         WHERE entity_type = 'display'
           AND entity_id IN (${placeholders})`)
            .run(...displayIds);
    }
    assertOnlyTargetProject(projectId, displayIds) {
        for (const displayId of displayIds) {
            const display = this.displays.getById(displayId);
            if (display && display.projectId !== projectId) {
                throw new Error(`Safety check failed: display ${displayId} belongs to project ${display.projectId}, not ${projectId}.`);
            }
        }
    }
    async reset(input) {
        const project = this.resolveBroadArrowProject();
        const before = this.countDisplays(project.id);
        const displayIds = this.listDisplayIds(project.id);
        console.info(`[DisplayReset] Broad Arrow Auctions active=${before.active} archived=${before.archived}`);
        this.assertOnlyTargetProject(project.id, displayIds);
        const instanceId = (0, neud_instance_id_1.getOrCreateNeudInstanceId)(this.settings);
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
                .filter((row) => row !== null)
                .map(cloud_display_mapper_1.toCloudDisplayTombstoneRow);
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
            throw new Error(`Display reset incomplete: active=${after.active}, archived=${after.archived}`);
        }
        if (this.cloudClient && input?.syncCloud !== false) {
            const cloudCount = await this.cloudClient.countDisplaysByProject(project.id);
            if (cloudCount > 0) {
                throw new Error(`Cloud display cleanup incomplete: remaining=${cloudCount}`);
            }
        }
        this.settings.set(broad_arrow_phase_1.BROAD_ARROW_DISPLAYS_RESET_SETTING_KEY, true);
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
exports.BroadArrowDisplayResetService = BroadArrowDisplayResetService;
