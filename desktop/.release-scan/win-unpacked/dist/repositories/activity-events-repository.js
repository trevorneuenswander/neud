"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityEventsRepository = void 0;
exports.createActivityEventId = createActivityEventId;
exports.toActivityEvent = toActivityEvent;
const crypto_1 = require("crypto");
const activity_message_1 = require("../services/activity-message");
class ActivityEventsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    getMaxSequenceId() {
        const row = this.db
            .prepare("SELECT MAX(sequence_id) AS max_id FROM activity_events")
            .get();
        return row?.max_id ?? 0;
    }
    listNewestFirst(limit) {
        const sql = limit != null
            ? "SELECT * FROM activity_events ORDER BY sequence_id DESC LIMIT ?"
            : "SELECT * FROM activity_events ORDER BY sequence_id DESC";
        const rows = limit != null
            ? this.db.prepare(sql).all(limit)
            : this.db.prepare(sql).all();
        return rows.map(mapRow);
    }
    getByCloudId(cloudId) {
        const row = this.db
            .prepare("SELECT * FROM activity_events WHERE cloud_id = ? LIMIT 1")
            .get(cloudId);
        return row ? mapRow(row) : null;
    }
    listPendingSync(limit = 50) {
        const rows = this.db
            .prepare(`SELECT * FROM activity_events
         WHERE sync_status IN ('pending', 'failed')
         ORDER BY sequence_id ASC
         LIMIT ?`)
            .all(limit);
        return rows.map(mapRow);
    }
    countBySyncStatus(status) {
        const row = this.db
            .prepare("SELECT COUNT(*) AS count FROM activity_events WHERE sync_status = ?")
            .get(status);
        return row.count;
    }
    insert(input) {
        const syncStatus = input.syncStatus ?? "pending";
        const sequenceId = parseSequenceId(input.event.id);
        this.db
            .prepare(`INSERT INTO activity_events (
          id, sequence_id, type, message, timestamp, source, severity, actor_json, metadata_json,
          cloud_id, sync_status, sync_attempt_count, last_sync_attempt_at, synced_at, sync_error,
          source_instance_id, cloud_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, NULL, ?, ?)`)
            .run(input.event.id, sequenceId, input.event.type, input.event.message, input.event.timestamp, input.event.source ?? null, input.event.severity ?? "info", input.event.actor ? JSON.stringify(input.event.actor) : null, JSON.stringify(input.event.metadata ?? {}), input.cloudId, syncStatus, syncStatus === "synced" ? new Date().toISOString() : null, input.instanceId, input.cloudUpdatedAt ?? null);
        return this.getByCloudId(input.cloudId);
    }
    upsertFromCloud(input) {
        const existing = this.getByCloudId(input.cloudId);
        if (existing) {
            this.db
                .prepare(`UPDATE activity_events SET
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
          WHERE cloud_id = ?`)
                .run(input.event.type, input.event.message, input.event.timestamp, input.event.source ?? null, input.event.severity ?? "info", input.event.actor ? JSON.stringify(input.event.actor) : null, JSON.stringify(input.event.metadata ?? {}), new Date().toISOString(), input.cloudUpdatedAt, input.cloudId);
            return this.getByCloudId(input.cloudId);
        }
        return this.insert({
            event: input.event,
            cloudId: input.cloudId,
            instanceId: input.instanceId,
            syncStatus: "synced",
            cloudUpdatedAt: input.cloudUpdatedAt,
        });
    }
    assignCloudIdsForLegacyRows(input) {
        const rows = this.db
            .prepare("SELECT id FROM activity_events WHERE cloud_id IS NULL OR cloud_id = ''")
            .all();
        let updated = 0;
        for (const row of rows) {
            const cloudId = input.resolveCloudId(row.id);
            this.db
                .prepare(`UPDATE activity_events SET
            cloud_id = ?,
            source_instance_id = COALESCE(source_instance_id, ?),
            sync_status = CASE WHEN sync_status = 'synced' THEN sync_status ELSE 'pending' END
          WHERE id = ?`)
                .run(cloudId, input.instanceId, row.id);
            updated += 1;
        }
        return updated;
    }
    markSyncAttempt(cloudId) {
        this.db
            .prepare(`UPDATE activity_events SET
          sync_status = 'syncing',
          sync_attempt_count = sync_attempt_count + 1,
          last_sync_attempt_at = ?
        WHERE cloud_id = ?`)
            .run(new Date().toISOString(), cloudId);
    }
    markSynced(cloudId, cloudUpdatedAt) {
        this.db
            .prepare(`UPDATE activity_events SET
          sync_status = 'synced',
          synced_at = ?,
          sync_error = NULL,
          cloud_updated_at = ?
        WHERE cloud_id = ?`)
            .run(new Date().toISOString(), cloudUpdatedAt, cloudId);
    }
    markFailed(cloudId, error) {
        this.db
            .prepare(`UPDATE activity_events SET
          sync_status = 'failed',
          sync_error = ?
        WHERE cloud_id = ?`)
            .run(error.slice(0, 500), cloudId);
    }
    updateMessage(id, message) {
        this.db
            .prepare("UPDATE activity_events SET message = ? WHERE id = ?")
            .run(message, id);
    }
}
exports.ActivityEventsRepository = ActivityEventsRepository;
function createActivityEventId(cloudId) {
    return cloudId?.trim() || (0, crypto_1.randomUUID)();
}
function parseSequenceId(id) {
    const match = id.match(/^activity-(\d+)$/);
    return match ? Number(match[1]) : Date.now();
}
function mapRow(row) {
    let actor;
    if (row.actor_json) {
        try {
            actor = JSON.parse(row.actor_json);
        }
        catch {
            actor = undefined;
        }
    }
    let metadata;
    try {
        metadata = JSON.parse(row.metadata_json);
    }
    catch {
        metadata = undefined;
    }
    const resolvedActor = {
        id: actor?.id,
        name: (0, activity_message_1.resolveActivityActorName)(actor),
        email: actor?.email,
    };
    const cloudId = row.cloud_id ?? row.id;
    return {
        id: row.id,
        type: row.type,
        message: row.message,
        timestamp: row.timestamp,
        source: row.source ?? undefined,
        severity: row.severity ?? "info",
        actor: resolvedActor,
        metadata,
        cloudId,
        syncStatus: row.sync_status ?? "pending",
        syncAttemptCount: row.sync_attempt_count ?? 0,
        lastSyncAttemptAt: row.last_sync_attempt_at,
        syncedAt: row.synced_at,
        syncError: row.sync_error,
        sourceInstanceId: row.source_instance_id,
        cloudUpdatedAt: row.cloud_updated_at,
        sequenceId: row.sequence_id,
    };
}
function toActivityEvent(record) {
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
