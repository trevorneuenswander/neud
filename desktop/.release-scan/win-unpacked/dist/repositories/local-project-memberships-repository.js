"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalProjectMembershipsRepository = void 0;
class LocalProjectMembershipsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    countForProject(projectId) {
        const row = this.db
            .prepare("SELECT COUNT(*) AS count FROM local_project_memberships WHERE project_id = ?")
            .get(projectId);
        return row.count;
    }
    countForUser(userId) {
        const row = this.db
            .prepare("SELECT COUNT(*) AS count FROM local_project_memberships WHERE user_id = ?")
            .get(userId);
        return row.count;
    }
    getProjectRole(userId, projectId) {
        const row = this.db
            .prepare("SELECT role FROM local_project_memberships WHERE user_id = ? AND project_id = ?")
            .get(userId, projectId);
        if (!row) {
            return null;
        }
        return normalizeRole(row.role);
    }
    listAll() {
        const rows = this.db
            .prepare("SELECT project_id, user_id, role, created_at, updated_at FROM local_project_memberships")
            .all();
        return rows.map((row) => ({
            projectId: row.project_id,
            userId: row.user_id,
            role: normalizeRole(row.role),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }
    ensureLegacyLocalOwnerMembership(projectId, userId) {
        if (this.countForProject(projectId) > 0) {
            return false;
        }
        return this.ensureOwnerMembership(projectId, userId);
    }
    ensureOwnerMembership(projectId, userId) {
        const existing = this.db
            .prepare("SELECT role FROM local_project_memberships WHERE user_id = ? AND project_id = ?")
            .get(userId, projectId);
        if (existing) {
            return false;
        }
        const now = new Date().toISOString();
        this.db
            .prepare(`INSERT INTO local_project_memberships (
          project_id, user_id, role, created_at, updated_at
        ) VALUES (?, ?, 'owner', ?, ?)`)
            .run(projectId, userId, now, now);
        return true;
    }
}
exports.LocalProjectMembershipsRepository = LocalProjectMembershipsRepository;
function normalizeRole(value) {
    switch (value) {
        case "owner":
        case "admin":
        case "operator":
        case "viewer":
            return value;
        default:
            return "viewer";
    }
}
