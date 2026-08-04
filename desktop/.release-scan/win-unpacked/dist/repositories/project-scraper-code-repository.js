"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectScraperCodeRepository = void 0;
exports.hashSource = hashSource;
exports.createRevisionId = createRevisionId;
const crypto_1 = require("crypto");
class ProjectScraperCodeRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    get(projectId) {
        const row = this.db
            .prepare("SELECT * FROM project_scraper_code WHERE project_id = ?")
            .get(projectId);
        return row ? mapRow(row) : null;
    }
    upsert(input) {
        const now = new Date().toISOString();
        const existing = this.get(input.projectId);
        if (!existing) {
            const record = {
                projectId: input.projectId,
                language: input.language ?? "javascript",
                entryFilename: input.entryFilename ?? "scraper.js",
                draftSource: input.draftSource ?? null,
                publishedSource: input.publishedSource ?? "",
                draftRevisionId: input.draftRevisionId ?? null,
                publishedRevisionId: input.publishedRevisionId ?? null,
                draftSavedAt: input.draftSavedAt ?? null,
                updatedAt: now,
                updatedBy: input.updatedBy ?? null,
                seededAt: input.seededAt ?? now,
            };
            this.db
                .prepare(`INSERT INTO project_scraper_code (
            project_id, language, entry_filename, draft_source, published_source,
            draft_revision_id, published_revision_id, draft_saved_at,
            updated_at, updated_by, seeded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                .run(record.projectId, record.language, record.entryFilename, record.draftSource, record.publishedSource, record.draftRevisionId, record.publishedRevisionId, record.draftSavedAt, record.updatedAt, record.updatedBy, record.seededAt);
            return record;
        }
        const next = {
            ...existing,
            language: input.language ?? existing.language,
            entryFilename: input.entryFilename ?? existing.entryFilename,
            draftSource: input.draftSource !== undefined ? input.draftSource : existing.draftSource,
            publishedSource: input.publishedSource ?? existing.publishedSource,
            draftRevisionId: input.draftRevisionId !== undefined
                ? input.draftRevisionId
                : existing.draftRevisionId,
            publishedRevisionId: input.publishedRevisionId !== undefined
                ? input.publishedRevisionId
                : existing.publishedRevisionId,
            draftSavedAt: input.draftSavedAt !== undefined ? input.draftSavedAt : existing.draftSavedAt,
            updatedAt: now,
            updatedBy: input.updatedBy ?? existing.updatedBy,
            seededAt: input.seededAt ?? existing.seededAt,
        };
        this.db
            .prepare(`UPDATE project_scraper_code SET
          language = ?,
          entry_filename = ?,
          draft_source = ?,
          published_source = ?,
          draft_revision_id = ?,
          published_revision_id = ?,
          draft_saved_at = ?,
          updated_at = ?,
          updated_by = ?,
          seeded_at = ?
        WHERE project_id = ?`)
            .run(next.language, next.entryFilename, next.draftSource, next.publishedSource, next.draftRevisionId, next.publishedRevisionId, next.draftSavedAt, next.updatedAt, next.updatedBy, next.seededAt, next.projectId);
        return next;
    }
}
exports.ProjectScraperCodeRepository = ProjectScraperCodeRepository;
function hashSource(value) {
    return (0, crypto_1.createHash)("sha256").update(value).digest("hex");
}
function createRevisionId() {
    return (0, crypto_1.randomUUID)();
}
function mapRow(row) {
    return {
        projectId: String(row.project_id),
        language: row.language === "typescript" ? "typescript" : "javascript",
        entryFilename: String(row.entry_filename ?? "scraper.js"),
        draftSource: typeof row.draft_source === "string" ? row.draft_source : null,
        publishedSource: String(row.published_source ?? ""),
        draftRevisionId: typeof row.draft_revision_id === "string" ? row.draft_revision_id : null,
        publishedRevisionId: typeof row.published_revision_id === "string"
            ? row.published_revision_id
            : null,
        draftSavedAt: typeof row.draft_saved_at === "string" ? row.draft_saved_at : null,
        updatedAt: String(row.updated_at),
        updatedBy: typeof row.updated_by === "string" ? row.updated_by : null,
        seededAt: typeof row.seeded_at === "string" ? row.seeded_at : null,
    };
}
