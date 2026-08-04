import { randomUUID } from "crypto";
import type { LocalDatabase } from "../database/connection";
import { resolveActivityActorName } from "../services/activity-message";
import type {
  ActivityActor,
  ActivityEvent,
  ActivitySeverity,
} from "../services/activity-session-store";
import type { ActivitySyncStatus } from "../services/activity-sync/types";

export type ActivityEventRecord = ActivityEvent & {
  cloudId: string;
  syncStatus: ActivitySyncStatus;
  syncAttemptCount: number;
  lastSyncAttemptAt: string | null;
  syncedAt: string | null;
  syncError: string | null;
  sourceInstanceId: string | null;
  cloudUpdatedAt: string | null;
  sequenceId: number;
};

type ActivityEventRow = {
  id: string;
  sequence_id: number;
  type: string;
  message: string;
  timestamp: string;
  source: string | null;
  severity: string;
  actor_json: string | null;
  metadata_json: string;
  cloud_id: string | null;
  sync_status: string;
  sync_attempt_count: number;
  last_sync_attempt_at: string | null;
  synced_at: string | null;
  sync_error: string | null;
  source_instance_id: string | null;
  cloud_updated_at: string | null;
};

export class ActivityEventsRepository {
  constructor(private readonly db: LocalDatabase) {}

  getMaxSequenceId(): number {
    const row = this.db
      .prepare("SELECT MAX(sequence_id) AS max_id FROM activity_events")
      .get() as { max_id: number | null } | undefined;
    return row?.max_id ?? 0;
  }

  listNewestFirst(limit?: number): ActivityEventRecord[] {
    const sql =
      limit != null
        ? "SELECT * FROM activity_events ORDER BY sequence_id DESC LIMIT ?"
        : "SELECT * FROM activity_events ORDER BY sequence_id DESC";
    const rows =
      limit != null
        ? (this.db.prepare(sql).all(limit) as ActivityEventRow[])
        : (this.db.prepare(sql).all() as ActivityEventRow[]);
    return rows.map(mapRow);
  }

  getByCloudId(cloudId: string): ActivityEventRecord | null {
    const row = this.db
      .prepare("SELECT * FROM activity_events WHERE cloud_id = ? LIMIT 1")
      .get(cloudId) as ActivityEventRow | undefined;
    return row ? mapRow(row) : null;
  }

  listPendingSync(limit = 50): ActivityEventRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM activity_events
         WHERE sync_status IN ('pending', 'failed')
         ORDER BY sequence_id ASC
         LIMIT ?`,
      )
      .all(limit) as ActivityEventRow[];
    return rows.map(mapRow);
  }

  countBySyncStatus(status: ActivitySyncStatus): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM activity_events WHERE sync_status = ?")
      .get(status) as { count: number };
    return row.count;
  }

  listUnsynced(limit = 100): ActivityEventRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM activity_events
         WHERE sync_status IN ('pending', 'failed')
         ORDER BY sequence_id ASC
         LIMIT ?`,
      )
      .all(limit) as ActivityEventRow[];
    return rows.map(mapRow);
  }

  summarizeUnsyncedEventTypes(): Record<string, number> {
    const rows = this.db
      .prepare(
        `SELECT type, COUNT(*) AS count
         FROM activity_events
         WHERE sync_status IN ('pending', 'failed')
         GROUP BY type
         ORDER BY count DESC, type ASC`,
      )
      .all() as Array<{ type: string; count: number }>;
    return Object.fromEntries(rows.map((row) => [row.type, row.count]));
  }

  listRejectedEventTypes(): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT type
         FROM activity_events
         WHERE sync_status = 'failed'
           AND (
             sync_error LIKE '%not allowed%'
             OR sync_error LIKE '%forbidden%'
             OR sync_error LIKE '%event_type=%'
           )
         ORDER BY type ASC`,
      )
      .all() as Array<{ type: string }>;
    return rows.map((row) => row.type);
  }

  countRecoverableFailedEvents(input: {
    isAllowedType: (type: string) => boolean;
    isRecoverableError: (error: string | null) => boolean;
  }): { recoverableFailedCount: number; unrecoverableFailedCount: number } {
    const rows = this.db
      .prepare(
        `SELECT type, sync_error
         FROM activity_events
         WHERE sync_status = 'failed'`,
      )
      .all() as Array<{ type: string; sync_error: string | null }>;

    let recoverableFailedCount = 0;
    let unrecoverableFailedCount = 0;
    for (const row of rows) {
      if (input.isRecoverableError(row.sync_error) && input.isAllowedType(row.type)) {
        recoverableFailedCount += 1;
      } else {
        unrecoverableFailedCount += 1;
      }
    }

    return { recoverableFailedCount, unrecoverableFailedCount };
  }

  retryRecoverableActivityEvents(input: {
    isAllowedType: (type: string) => boolean;
    isRecoverableError: (error: string | null) => boolean;
  }): {
    requeuedCount: number;
    recoverableFailedCount: number;
    unrecoverableFailedCount: number;
  } {
    const rows = this.db
      .prepare(
        `SELECT cloud_id, type, sync_error
         FROM activity_events
         WHERE sync_status = 'failed'`,
      )
      .all() as Array<{ cloud_id: string; type: string; sync_error: string | null }>;

    let requeuedCount = 0;
    let recoverableFailedCount = 0;
    let unrecoverableFailedCount = 0;

    for (const row of rows) {
      const recoverable =
        input.isRecoverableError(row.sync_error) && input.isAllowedType(row.type);
      if (recoverable) {
        recoverableFailedCount += 1;
        this.db
          .prepare(
            `UPDATE activity_events SET
              sync_status = 'pending',
              sync_error = NULL
            WHERE cloud_id = ?`,
          )
          .run(row.cloud_id);
        requeuedCount += 1;
      } else {
        unrecoverableFailedCount += 1;
      }
    }

    return { requeuedCount, recoverableFailedCount, unrecoverableFailedCount };
  }

  requeuePending(cloudId: string): void {
    this.db
      .prepare(
        `UPDATE activity_events SET
          sync_status = 'pending',
          sync_error = NULL
        WHERE cloud_id = ? AND sync_status = 'failed'`,
      )
      .run(cloudId);
  }

  insert(input: {
    event: ActivityEvent;
    cloudId: string;
    instanceId: string;
    syncStatus?: ActivitySyncStatus;
    cloudUpdatedAt?: string | null;
  }): ActivityEventRecord {
    const syncStatus = input.syncStatus ?? "pending";
    const sequenceId = parseSequenceId(input.event.id);
    this.db
      .prepare(
        `INSERT INTO activity_events (
          id, sequence_id, type, message, timestamp, source, severity, actor_json, metadata_json,
          cloud_id, sync_status, sync_attempt_count, last_sync_attempt_at, synced_at, sync_error,
          source_instance_id, cloud_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, NULL, ?, ?)`,
      )
      .run(
        input.event.id,
        sequenceId,
        input.event.type,
        input.event.message,
        input.event.timestamp,
        input.event.source ?? null,
        input.event.severity ?? "info",
        input.event.actor ? JSON.stringify(input.event.actor) : null,
        JSON.stringify(input.event.metadata ?? {}),
        input.cloudId,
        syncStatus,
        syncStatus === "synced" ? new Date().toISOString() : null,
        input.instanceId,
        input.cloudUpdatedAt ?? null,
      );

    return this.getByCloudId(input.cloudId)!;
  }

  upsertFromCloud(input: {
    event: ActivityEvent;
    cloudId: string;
    instanceId: string;
    cloudUpdatedAt: string;
  }): ActivityEventRecord {
    const existing = this.getByCloudId(input.cloudId);
    if (existing) {
      this.db
        .prepare(
          `UPDATE activity_events SET
            type = ?,
            message = ?,
            timestamp = ?,
            source = ?,
            severity = ?,
            actor_json = ?,
            metadata_json = ?,
            sync_status = 'synced',
            synced_at = ?,
            sync_error = NULL,
            cloud_updated_at = ?
          WHERE cloud_id = ?`,
        )
        .run(
          input.event.type,
          input.event.message,
          input.event.timestamp,
          input.event.source ?? null,
          input.event.severity ?? "info",
          input.event.actor ? JSON.stringify(input.event.actor) : null,
          JSON.stringify(input.event.metadata ?? {}),
          new Date().toISOString(),
          input.cloudUpdatedAt,
          input.cloudId,
        );
      return this.getByCloudId(input.cloudId)!;
    }

    return this.insert({
      event: input.event,
      cloudId: input.cloudId,
      instanceId: input.instanceId,
      syncStatus: "synced",
      cloudUpdatedAt: input.cloudUpdatedAt,
    });
  }

  assignCloudIdsForLegacyRows(input: {
    instanceId: string;
    resolveCloudId: (localId: string) => string;
  }): number {
    const rows = this.db
      .prepare("SELECT id FROM activity_events WHERE cloud_id IS NULL OR cloud_id = ''")
      .all() as Array<{ id: string }>;

    let updated = 0;
    for (const row of rows) {
      const cloudId = input.resolveCloudId(row.id);
      this.db
        .prepare(
          `UPDATE activity_events SET
            cloud_id = ?,
            source_instance_id = COALESCE(source_instance_id, ?),
            sync_status = CASE WHEN sync_status = 'synced' THEN sync_status ELSE 'pending' END
          WHERE id = ?`,
        )
        .run(cloudId, input.instanceId, row.id);
      updated += 1;
    }
    return updated;
  }

  markSyncAttempt(cloudId: string): void {
    this.db
      .prepare(
        `UPDATE activity_events SET
          sync_status = 'syncing',
          sync_attempt_count = sync_attempt_count + 1,
          last_sync_attempt_at = ?
        WHERE cloud_id = ?`,
      )
      .run(new Date().toISOString(), cloudId);
  }

  markSynced(cloudId: string, cloudUpdatedAt: string): void {
    this.db
      .prepare(
        `UPDATE activity_events SET
          sync_status = 'synced',
          synced_at = ?,
          sync_error = NULL,
          cloud_updated_at = ?
        WHERE cloud_id = ?`,
      )
      .run(new Date().toISOString(), cloudUpdatedAt, cloudId);
  }

  markFailed(cloudId: string, error: string): void {
    this.db
      .prepare(
        `UPDATE activity_events SET
          sync_status = 'failed',
          sync_error = ?
        WHERE cloud_id = ?`,
      )
      .run(error.slice(0, 500), cloudId);
  }

  updateMessage(id: string, message: string): void {
    this.db
      .prepare("UPDATE activity_events SET message = ? WHERE id = ?")
      .run(message, id);
  }
}

export function createActivityEventId(cloudId?: string): string {
  return cloudId?.trim() || randomUUID();
}

function parseSequenceId(id: string): number {
  const match = id.match(/^activity-(\d+)$/);
  return match ? Number(match[1]) : Date.now();
}

function mapRow(row: ActivityEventRow): ActivityEventRecord {
  let actor: ActivityActor | undefined;
  if (row.actor_json) {
    try {
      actor = JSON.parse(row.actor_json) as ActivityActor;
    } catch {
      actor = undefined;
    }
  }

  let metadata: Record<string, unknown> | undefined;
  try {
    metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
  } catch {
    metadata = undefined;
  }

  const resolvedActor: ActivityActor = {
    id: actor?.id,
    name: resolveActivityActorName(actor, row.type),
    email: actor?.email,
  };

  const cloudId = row.cloud_id ?? row.id;

  return {
    id: row.id,
    type: row.type,
    message: row.message,
    timestamp: row.timestamp,
    source: row.source ?? undefined,
    severity: (row.severity as ActivitySeverity) ?? "info",
    actor: resolvedActor,
    metadata,
    cloudId,
    syncStatus: (row.sync_status as ActivitySyncStatus) ?? "pending",
    syncAttemptCount: row.sync_attempt_count ?? 0,
    lastSyncAttemptAt: row.last_sync_attempt_at,
    syncedAt: row.synced_at,
    syncError: row.sync_error,
    sourceInstanceId: row.source_instance_id,
    cloudUpdatedAt: row.cloud_updated_at,
    sequenceId: row.sequence_id,
  };
}

export function toActivityEvent(record: ActivityEventRecord): ActivityEvent {
  return {
    id: record.id,
    type: record.type,
    message: record.message,
    timestamp: record.timestamp,
    source: record.source,
    severity: record.severity,
    actor: record.actor,
    metadata: record.metadata,
  };
}
