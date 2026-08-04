import type { LocalDatabase } from "../database/connection";

export type DisplayDeletionTombstone = {
  displayId: string;
  projectId: string;
  deletedAt: string;
  deletedByUserId: string | null;
  syncStatus: string;
  syncAttemptCount: number;
  lastSyncAttemptAt: string | null;
  syncedAt: string | null;
  syncError: string | null;
  sourceInstanceId: string;
};

export class DisplayDeletionTombstonesRepository {
  constructor(private readonly db: LocalDatabase) {}

  create(input: {
    displayId: string;
    projectId: string;
    deletedByUserId?: string | null;
    sourceInstanceId: string;
  }): DisplayDeletionTombstone {
    const deletedAt = new Date().toISOString();
    const record: DisplayDeletionTombstone = {
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
      .prepare(
        `INSERT INTO display_deletion_tombstones (
          display_id, project_id, deleted_at, deleted_by_user_id,
          sync_status, sync_attempt_count, source_instance_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.displayId,
        record.projectId,
        record.deletedAt,
        record.deletedByUserId,
        record.syncStatus,
        record.syncAttemptCount,
        record.sourceInstanceId,
      );

    return record;
  }

  getByDisplayId(displayId: string): DisplayDeletionTombstone | null {
    const row = this.db
      .prepare("SELECT * FROM display_deletion_tombstones WHERE display_id = ?")
      .get(displayId) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  isDeleted(displayId: string): boolean {
    return this.getByDisplayId(displayId) !== null;
  }

  listPending(limit = 100): DisplayDeletionTombstone[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM display_deletion_tombstones
         WHERE sync_status IN ('pending', 'failed')
         ORDER BY deleted_at ASC
         LIMIT ?`,
      )
      .all(limit) as Record<string, unknown>[];
    return rows.map(mapRow);
  }

  markSynced(displayId: string, syncedAt: string): void {
    this.db
      .prepare(
        `UPDATE display_deletion_tombstones SET sync_status = 'synced', synced_at = ?, sync_error = NULL WHERE display_id = ?`,
      )
      .run(syncedAt, displayId);
  }

  markFailed(displayId: string, error: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE display_deletion_tombstones SET sync_status = 'failed', sync_error = ?,
         sync_attempt_count = sync_attempt_count + 1, last_sync_attempt_at = ? WHERE display_id = ?`,
      )
      .run(error, now, displayId);
  }

  removeSynced(displayId: string): void {
    this.db
      .prepare("DELETE FROM display_deletion_tombstones WHERE display_id = ? AND sync_status = 'synced'")
      .run(displayId);
  }
}

function mapRow(row: Record<string, unknown>): DisplayDeletionTombstone {
  return {
    displayId: String(row.display_id),
    projectId: String(row.project_id),
    deletedAt: String(row.deleted_at),
    deletedByUserId:
      typeof row.deleted_by_user_id === "string" ? row.deleted_by_user_id : null,
    syncStatus: String(row.sync_status ?? "pending"),
    syncAttemptCount: Number(row.sync_attempt_count ?? 0),
    lastSyncAttemptAt:
      typeof row.last_sync_attempt_at === "string" ? row.last_sync_attempt_at : null,
    syncedAt: typeof row.synced_at === "string" ? row.synced_at : null,
    syncError: typeof row.sync_error === "string" ? row.sync_error : null,
    sourceInstanceId: String(row.source_instance_id),
  };
}
