"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectMembershipsRepository = void 0;
const crypto_1 = require("crypto");
function mapMembership(row) {
    return {
        id: row.id,
        projectId: row.project_id,
        teamId: row.team_id,
        userId: row.user_id,
        accessRole: row.access_role,
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
class ProjectMembershipsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    listForUser(userId) {
        const rows = this.db
            .prepare("SELECT * FROM project_memberships WHERE user_id = ?")
            .all(userId);
        return rows.map(mapMembership);
    }
    listForProject(projectId) {
        const rows = this.db
            .prepare("SELECT * FROM project_memberships WHERE project_id = ?")
            .all(projectId);
        return rows.map(mapMembership);
    }
    listForProjectTeam(projectId, teamId) {
        const rows = this.db
            .prepare("SELECT * FROM project_memberships WHERE project_id = ? AND team_id = ?")
            .all(projectId, teamId);
        return rows.map(mapMembership);
    }
    get(projectId, teamId, userId) {
        const row = this.db
            .prepare("SELECT * FROM project_memberships WHERE project_id = ? AND team_id = ? AND user_id = ?")
            .get(projectId, teamId, userId);
        return row ? mapMembership(row) : null;
    }
    getAnyForProjectUser(projectId, userId) {
        const row = this.db
            .prepare("SELECT * FROM project_memberships WHERE project_id = ? AND user_id = ? LIMIT 1")
            .get(projectId, userId);
        return row ? mapMembership(row) : null;
    }
    countForUser(userId) {
        const row = this.db
            .prepare("SELECT COUNT(*) AS count FROM project_memberships WHERE user_id = ?")
            .get(userId);
        return row.count;
    }
    upsert(input) {
        const existing = this.get(input.projectId, input.teamId, input.userId);
        const now = new Date().toISOString();
        if (existing) {
            this.db
                .prepare("UPDATE project_memberships SET access_role = ?, updated_at = ? WHERE id = ?")
                .run(input.accessRole, now, existing.id);
            return this.get(input.projectId, input.teamId, input.userId);
        }
        const id = (0, crypto_1.randomUUID)();
        this.db
            .prepare(`INSERT INTO project_memberships (
          id, project_id, team_id, user_id, access_role, created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, input.projectId, input.teamId, input.userId, input.accessRole, input.createdByUserId ?? null, now, now);
        return this.get(input.projectId, input.teamId, input.userId);
    }
    remove(projectId, teamId, userId) {
        this.db
            .prepare("DELETE FROM project_memberships WHERE project_id = ? AND team_id = ? AND user_id = ?")
            .run(projectId, teamId, userId);
    }
    removeAllForProjectTeam(projectId, teamId) {
        this.db
            .prepare("DELETE FROM project_memberships WHERE project_id = ? AND team_id = ?")
            .run(projectId, teamId);
    }
    removeAllForProject(projectId) {
        this.db.prepare("DELETE FROM project_memberships WHERE project_id = ?").run(projectId);
    }
}
exports.ProjectMembershipsRepository = ProjectMembershipsRepository;
