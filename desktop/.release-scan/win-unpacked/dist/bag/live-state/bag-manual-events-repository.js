"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BagManualEventsRepository = void 0;
const crypto_1 = require("crypto");
class BagManualEventsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    insert(input) {
        const now = new Date().toISOString();
        const record = {
            id: (0, crypto_1.randomUUID)(),
            projectId: input.projectId,
            eventType: input.eventType,
            previousValue: input.previousValue ?? null,
            nextValue: input.nextValue ?? null,
            details: input.details ?? {},
            createdAt: now,
            createdBy: input.createdBy ?? null,
        };
        this.db
            .prepare(`INSERT INTO bag_manual_events (
          id, project_id, event_type, previous_value_json, next_value_json,
          details_json, created_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(record.id, record.projectId, record.eventType, JSON.stringify(record.previousValue), JSON.stringify(record.nextValue), JSON.stringify(record.details), record.createdAt, record.createdBy);
        return record;
    }
}
exports.BagManualEventsRepository = BagManualEventsRepository;
