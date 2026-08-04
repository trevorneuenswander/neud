"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectTeamAssignmentsRepository = void 0;
const crypto_1 = require("crypto");
function mapRow(row) {
    return {
        id: row.id,
        projectId: row.project_id,
        teamId: row.team_id,
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at,
    };
}
class ProjectTeamAssignmentsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    listForProject(projectId) {
        const rows = this.db
            .prepare("SELECT * FROM project_team_assignments WHERE project_id = ? ORDER BY created_at ASC")
            .all(projectId);
        return rows.map(mapRow);
    }
    listForTeam(teamId) {
        const rows = this.db
            .prepare("SELECT * FROM project_team_assignments WHERE team_id = ?")
            .all(teamId);
        return rows.map(mapRow);
    }
    getTeamIdsForProject(projectId) {
        return this.listForProject(projectId).map((entry) => entry.teamId);
    }
    getProjectIdsForTeam(teamId) {
        return this.listForTeam(teamId).map((entry) => entry.projectId);
    }
    countProjectsForTeam(teamId) {
        const row = this.db
            .prepare("SELECT COUNT(DISTINCT project_id) AS count FROM project_team_assignments WHERE team_id = ?")
            .get(teamId);
        return row.count;
    }
    isAssigned(projectId, teamId) {
        const row = this.db
            .prepare("SELECT id FROM project_team_assignments WHERE project_id = ? AND team_id = ?")
            .get(projectId, teamId);
        return Boolean(row);
    }
    assign(input) {
        const existing = this.db
            .prepare("SELECT * FROM project_team_assignments WHERE project_id = ? AND team_id = ?")
            .get(input.projectId, input.teamId);
        if (existing) {
            return mapRow(existing);
        }
        const id = (0, crypto_1.randomUUID)();
        const now = new Date().toISOString();
        this.db
            .prepare(`INSERT INTO project_team_assignments (
          id, project_id, team_id, created_by_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?)`)
            .run(id, input.projectId, input.teamId, input.createdByUserId ?? null, now);
        return this.listForProject(input.projectId).find((entry) => entry.id === id);
    }
    remove(projectId, teamId) {
        this.db
            .prepare("DELETE FROM project_team_assignments WHERE project_id = ? AND team_id = ?")
            .run(projectId, teamId);
    }
    setTeamsForProject(projectId, teamIds, createdByUserId) {
        const uniqueTeamIds = [...new Set(teamIds)];
        const existing = new Set(this.getTeamIdsForProject(projectId));
        for (const teamId of uniqueTeamIds) {
            if (!existing.has(teamId)) {
                this.assign({ projectId, teamId, createdByUserId });
            }
        }
        for (const teamId of existing) {
            if (!uniqueTeamIds.includes(teamId)) {
                this.remove(projectId, teamId);
            }
        }
        return this.getTeamIdsForProject(projectId);
    }
    listTeamsByProjectIds(projectIds) {
        if (projectIds.length === 0) {
            return new Map();
        }
        const placeholders = projectIds.map(() => "?").join(", ");
        const rows = this.db
            .prepare(`SELECT project_id, team_id FROM project_team_assignments
         WHERE project_id IN (${placeholders})
         ORDER BY project_id ASC, team_id ASC`)
            .all(...projectIds);
        const map = new Map();
        for (const row of rows) {
            const current = map.get(row.project_id) ?? [];
            current.push(row.team_id);
            map.set(row.project_id, current);
        }
        return map;
    }
}
exports.ProjectTeamAssignmentsRepository = ProjectTeamAssignmentsRepository;
