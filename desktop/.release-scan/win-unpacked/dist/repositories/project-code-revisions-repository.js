"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectValidationLogsRepository = exports.ProjectCodeRevisionsRepository = void 0;
const crypto_1 = require("crypto");
class ProjectCodeRevisionsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    getNextDisplayVersionNumber(projectId, displayId) {
        const row = this.db
            .prepare(`SELECT COALESCE(MAX(version_number), 0) AS max_version
         FROM project_code_revisions
         WHERE project_id = ? AND resource_type = 'display' AND resource_id = ?`)
            .get(projectId, displayId);
        return Number(row?.max_version ?? 0) + 1;
    }
    create(input) {
        const id = input.id ?? (0, crypto_1.randomUUID)();
        const now = new Date().toISOString();
        const versionNumber = input.resourceType === "display"
            ? (input.versionNumber ??
                this.getNextDisplayVersionNumber(input.projectId, input.resourceId))
            : (input.versionNumber ?? null);
        const record = {
            id,
            projectId: input.projectId,
            resourceType: input.resourceType,
            resourceId: input.resourceId,
            revisionName: input.revisionName ?? null,
            changeNote: input.changeNote ?? null,
            message: input.message ?? null,
            sourceHash: input.sourceHash,
            validationStatus: input.validationStatus ?? "not-validated",
            versionNumber,
            createdAt: now,
            createdBy: input.createdBy,
            metadata: input.metadata ?? {},
        };
        this.db
            .prepare(`INSERT INTO project_code_revisions (
          id, project_id, resource_type, resource_id, revision_name, change_note,
          message, source_hash, validation_status, version_number, created_at, created_by, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(record.id, record.projectId, record.resourceType, record.resourceId, record.revisionName, record.changeNote, record.message, record.sourceHash, record.validationStatus, record.versionNumber, record.createdAt, record.createdBy, JSON.stringify(record.metadata));
        return record;
    }
    getById(revisionId) {
        const row = this.db
            .prepare("SELECT * FROM project_code_revisions WHERE id = ?")
            .get(revisionId);
        return row ? mapRow(row) : null;
    }
    listForResource(input) {
        const limit = input.limit ?? 50;
        const rows = this.db
            .prepare(`SELECT * FROM project_code_revisions
         WHERE project_id = ? AND resource_type = ? AND resource_id = ?
         ORDER BY created_at DESC
         LIMIT ?`)
            .all(input.projectId, input.resourceType, input.resourceId, limit);
        return rows.map(mapRow);
    }
    deleteById(revisionId) {
        const existing = this.getById(revisionId);
        if (!existing) {
            return false;
        }
        this.db.prepare("DELETE FROM project_code_revisions WHERE id = ?").run(revisionId);
        return true;
    }
    deleteByResource(input) {
        this.db
            .prepare(`DELETE FROM project_code_revisions
         WHERE project_id = ? AND resource_type = ? AND resource_id = ?`)
            .run(input.projectId, input.resourceType, input.resourceId);
    }
    updateRevisionName(revisionId, revisionName) {
        const existing = this.getById(revisionId);
        if (!existing) {
            return null;
        }
        this.db
            .prepare(`UPDATE project_code_revisions
         SET revision_name = ?
         WHERE id = ?`)
            .run(revisionName, revisionId);
        return {
            ...existing,
            revisionName,
        };
    }
}
exports.ProjectCodeRevisionsRepository = ProjectCodeRevisionsRepository;
class ProjectValidationLogsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    append(input) {
        const now = new Date().toISOString();
        this.db
            .prepare(`INSERT INTO project_validation_logs (
          project_id, resource_type, resource_id, status, summary,
          details_json, created_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(input.projectId, input.resourceType, input.resourceId, input.status, input.summary, JSON.stringify(input.details), now, input.createdBy ?? null);
    }
    listByProject(projectId, limit = 100) {
        const rows = this.db
            .prepare(`SELECT * FROM project_validation_logs
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT ?`)
            .all(projectId, limit);
        return rows.map((row) => ({
            id: Number(row.id),
            projectId: String(row.project_id),
            resourceType: String(row.resource_type),
            resourceId: String(row.resource_id),
            status: String(row.status),
            summary: String(row.summary),
            details: JSON.parse(String(row.details_json ?? "[]")),
            createdAt: String(row.created_at),
            createdBy: typeof row.created_by === "string" ? row.created_by : null,
        }));
    }
}
exports.ProjectValidationLogsRepository = ProjectValidationLogsRepository;
function mapRow(row) {
    let metadata = {};
    try {
        metadata = JSON.parse(String(row.metadata_json ?? "{}"));
    }
    catch {
        metadata = {};
    }
    return {
        id: String(row.id),
        projectId: String(row.project_id),
        resourceType: row.resource_type === "display" ? "display" : "scraper",
        resourceId: String(row.resource_id),
        revisionName: typeof row.revision_name === "string" ? row.revision_name : null,
        changeNote: typeof row.change_note === "string" ? row.change_note : null,
        message: typeof row.message === "string" ? row.message : null,
        sourceHash: String(row.source_hash),
        validationStatus: row.validation_status === "valid" || row.validation_status === "invalid"
            ? row.validation_status
            : "not-validated",
        versionNumber: typeof row.version_number === "number"
            ? row.version_number
            : row.version_number == null
                ? null
                : Number(row.version_number) || null,
        createdAt: String(row.created_at),
        createdBy: String(row.created_by),
        metadata,
    };
}
