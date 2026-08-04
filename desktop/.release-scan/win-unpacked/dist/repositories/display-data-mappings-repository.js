"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisplayDataMappingsRepository = void 0;
const crypto_1 = require("crypto");
function mapRow(row) {
    return {
        id: row.id,
        displayId: row.display_id,
        jsonPath: row.json_path,
        targetSelector: row.target_selector,
        targetType: row.target_type,
        targetProperty: row.target_property,
        formatter: row.formatter,
        conditionJson: row.condition_json,
        fallbackValue: row.fallback_value,
        sortOrder: row.sort_order ?? 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdByUserId: row.created_by_user_id,
        updatedByUserId: row.updated_by_user_id,
        syncVersion: row.sync_version ?? 1,
        deletedAt: row.deleted_at,
    };
}
class DisplayDataMappingsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    listByDisplayId(displayId) {
        const rows = this.db
            .prepare(`SELECT * FROM display_data_mappings
         WHERE display_id = ?
           AND deleted_at IS NULL
         ORDER BY sort_order ASC, created_at ASC`)
            .all(displayId);
        return rows.map(mapRow);
    }
    getById(mappingId) {
        const row = this.db
            .prepare("SELECT * FROM display_data_mappings WHERE id = ? AND deleted_at IS NULL")
            .get(mappingId);
        return row ? mapRow(row) : null;
    }
    replaceForDisplay(input) {
        const now = new Date().toISOString();
        return this.db.transaction(() => {
            this.db
                .prepare(`UPDATE display_data_mappings
           SET deleted_at = ?, updated_at = ?, updated_by_user_id = ?, sync_version = sync_version + 1
           WHERE display_id = ? AND deleted_at IS NULL`)
                .run(now, now, input.userId, input.displayId);
            const insert = this.db.prepare(`INSERT INTO display_data_mappings (
          id, display_id, json_path, target_selector, target_type, target_property,
          formatter, condition_json, fallback_value, sort_order,
          created_at, updated_at, created_by_user_id, updated_by_user_id, sync_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
            for (const mapping of input.mappings) {
                insert.run(mapping.id ?? (0, crypto_1.randomUUID)(), input.displayId, mapping.jsonPath, mapping.targetSelector, mapping.targetType, mapping.targetProperty ?? null, mapping.formatter ?? null, mapping.conditionJson ?? null, mapping.fallbackValue ?? null, mapping.sortOrder, now, now, input.userId, input.userId);
            }
            return this.listByDisplayId(input.displayId);
        });
    }
    listPendingSync(limit = 100) {
        const rows = this.db
            .prepare(`SELECT * FROM display_data_mappings
         WHERE deleted_at IS NULL
         ORDER BY updated_at ASC
         LIMIT ?`)
            .all(limit);
        return rows.map(mapRow);
    }
    markSynced(mappingId, syncedAt) {
        this.db
            .prepare(`UPDATE display_data_mappings
         SET updated_at = ?, sync_version = sync_version
         WHERE id = ?`)
            .run(syncedAt, mappingId);
    }
}
exports.DisplayDataMappingsRepository = DisplayDataMappingsRepository;
