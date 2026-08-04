"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportHistoryRepository = void 0;
const crypto_1 = require("crypto");
class ImportHistoryRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    getLatestSuccessForSource(sourceProjectId) {
        const row = this.db
            .prepare(`SELECT * FROM import_history
         WHERE source_project_id = ? AND result = 'success'
         ORDER BY imported_at DESC
         LIMIT 1`)
            .get(sourceProjectId);
        return row ? mapRow(row) : null;
    }
    listSuccessfulBySourceIds(sourceProjectIds) {
        if (sourceProjectIds.length === 0)
            return [];
        const placeholders = sourceProjectIds.map(() => "?").join(", ");
        const rows = this.db
            .prepare(`SELECT * FROM import_history
         WHERE source_project_id IN (${placeholders}) AND result = 'success'
         ORDER BY imported_at DESC`)
            .all(...sourceProjectIds);
        const latestBySource = new Map();
        for (const row of rows) {
            if (!row.source_project_id)
                continue;
            if (!latestBySource.has(row.source_project_id)) {
                latestBySource.set(row.source_project_id, mapRow(row));
            }
        }
        return [...latestBySource.values()];
    }
    insert(record) {
        const next = {
            id: record.id ?? (0, crypto_1.randomUUID)(),
            sourceType: record.sourceType,
            sourceProjectId: record.sourceProjectId,
            localProjectId: record.localProjectId,
            importedAt: record.importedAt ?? new Date().toISOString(),
            importVersion: record.importVersion,
            sourceUpdatedAt: record.sourceUpdatedAt,
            result: record.result,
            importedAsCopy: record.importedAsCopy,
            details: record.details,
        };
        this.db
            .prepare(`INSERT INTO import_history (
          id, source_type, source_project_id, local_project_id, imported_at,
          import_version, source_updated_at, result, imported_as_copy, details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(next.id, next.sourceType, next.sourceProjectId, next.localProjectId, next.importedAt, next.importVersion, next.sourceUpdatedAt, next.result, next.importedAsCopy ? 1 : 0, JSON.stringify(next.details));
        return next;
    }
}
exports.ImportHistoryRepository = ImportHistoryRepository;
function mapRow(row) {
    return {
        id: row.id,
        sourceType: row.source_type,
        sourceProjectId: row.source_project_id,
        localProjectId: row.local_project_id,
        importedAt: row.imported_at,
        importVersion: row.import_version,
        sourceUpdatedAt: row.source_updated_at,
        result: row.result === "success" ? "success" : "failed",
        importedAsCopy: row.imported_as_copy === 1,
        details: parseJsonObject(row.details_json),
    };
}
function parseJsonObject(value) {
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
}
