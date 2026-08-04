"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisplayDeletionTombstonesRepository = void 0;
class DisplayDeletionTombstonesRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    create(input) {
        const deletedAt = new Date().toISOString();
        const record = {
            displayId: input.displayId,
            projectId: input.projectId,
            deletedAt,
            deletedByUserId: input.deletedByUserId ?? null,
            syncStatus: "pending",
            syncAttemptCount: 0,
            lastSyncAttemptAt: null,
            syncedAt: null,
            syncError: null,
            sourceInstanceId: input.sourceInstanceId,
        };
        this.db
            .prepare(`INSERT INTO display_deletion_tombstones (
          display_id, project_id, deleted_at, deleted_by_user_id,
          sync_status, sync_attempt_count, source_instance_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(record.displayId, record.projectId, record.deletedAt, record.deletedByUserId, record.syncStatus, record.syncAttemptCount, record.sourceInstanceId);
        return record;
    }
    getByDisplayId(displayId) {
        const row = this.db
            .prepare("SELECT * FROM display_deletion_tombstones WHERE display_id = ?")
            .get(displayId);
        return row ? mapRow(row) : null;
    }
    isDeleted(displayId) {
        return this.getByDisplayId(displayId) !== null;
    }
    listPending(limit = 100) {
        const rows = this.db
            .prepare(`SELECT * FROM display_deletion_tombstones
         WHERE sync_status IN ('pending', 'failed')
         ORDER BY deleted_at ASC
         LIMIT ?`)
            .all(limit);
        return rows.map(mapRow);
    }
    markSynced(displayId, syncedAt) {
        this.db
            .prepare(`UPDATE display_deletion_tombstones SET sync_status = 'synced', synced_at = ?, sync_error = NULL WHERE display_id = ?`)
            .run(syncedAt, displayId);
    }
    markFailed(displayId, error) {
        const now = new Date().toISOString();
        this.db
            .prepare(`UPDATE display_deletion_tombstones SET sync_status = 'failed', sync_error = ?,
         sync_attempt_count = sync_attempt_count + 1, last_sync_attempt_at = ? WHERE display_id = ?`)
            .run(error, now, displayId);
    }
    removeSynced(displayId) {
        this.db
            .prepare("DELETE FROM display_deletion_tombstones WHERE display_id = ? AND sync_status = 'synced'")
            .run(displayId);
    }
}
exports.DisplayDeletionTombstonesRepository = DisplayDeletionTombstonesRepository;
function mapRow(row) {
    return {
        displayId: String(row.display_id),
        projectId: String(row.project_id),
        deletedAt: String(row.deleted_at),
        deletedByUserId: typeof row.deleted_by_user_id === "string" ? row.deleted_by_user_id : null,
        syncStatus: String(row.sync_status ?? "pending"),
        syncAttemptCount: Number(row.sync_attempt_count ?? 0),
        lastSyncAttemptAt: typeof row.last_sync_attempt_at === "string" ? row.last_sync_attempt_at : null,
        syncedAt: typeof row.synced_at === "string" ? row.synced_at : null,
        syncError: typeof row.sync_error === "string" ? row.sync_error : null,
        sourceInstanceId: String(row.source_instance_id),
    };
}
