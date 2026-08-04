"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisplaySyncQueueRepository = void 0;
const crypto_1 = require("crypto");
class DisplaySyncQueueRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    enqueue(input) {
        const entry = {
            id: (0, crypto_1.randomUUID)(),
            entityType: input.entityType,
            entityId: input.entityId,
            operationType: input.operationType,
            payload: input.payload ?? {},
            createdAt: new Date().toISOString(),
            attemptCount: 0,
            lastAttemptAt: null,
            lastError: null,
            syncState: "pending",
            sourceInstanceId: input.sourceInstanceId,
        };
        this.db
            .prepare(`INSERT INTO display_sync_queue (
          id, entity_type, entity_id, operation_type, payload_json,
          created_at, attempt_count, sync_state, source_instance_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(entry.id, entry.entityType, entry.entityId, entry.operationType, JSON.stringify(entry.payload), entry.createdAt, entry.attemptCount, entry.syncState, entry.sourceInstanceId);
        return entry;
    }
    listPending(limit = 100) {
        const rows = this.db
            .prepare(`SELECT * FROM display_sync_queue
         WHERE sync_state IN ('pending', 'failed')
         ORDER BY created_at ASC
         LIMIT ?`)
            .all(limit);
        return rows.map(mapRow);
    }
    markSynced(id) {
        this.db
            .prepare("UPDATE display_sync_queue SET sync_state = 'synced', last_error = NULL WHERE id = ?")
            .run(id);
    }
    markFailed(id, error) {
        const now = new Date().toISOString();
        this.db
            .prepare(`UPDATE display_sync_queue SET sync_state = 'failed', last_error = ?,
         attempt_count = attempt_count + 1, last_attempt_at = ? WHERE id = ?`)
            .run(error, now, id);
    }
    countByState(syncState) {
        const row = this.db
            .prepare("SELECT COUNT(*) AS count FROM display_sync_queue WHERE sync_state = ?")
            .get(syncState);
        return Number(row?.count ?? 0);
    }
}
exports.DisplaySyncQueueRepository = DisplaySyncQueueRepository;
function mapRow(row) {
    let payload = {};
    try {
        payload = JSON.parse(String(row.payload_json ?? "{}"));
    }
    catch {
        payload = {};
    }
    return {
        id: String(row.id),
        entityType: String(row.entity_type),
        entityId: String(row.entity_id),
        operationType: String(row.operation_type),
        payload,
        createdAt: String(row.created_at),
        attemptCount: Number(row.attempt_count ?? 0),
        lastAttemptAt: typeof row.last_attempt_at === "string" ? row.last_attempt_at : null,
        lastError: typeof row.last_error === "string" ? row.last_error : null,
        syncState: String(row.sync_state ?? "pending"),
        sourceInstanceId: String(row.source_instance_id),
    };
}
