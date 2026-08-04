"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamMembershipsRepository = void 0;
const crypto_1 = require("crypto");
function mapMembership(row) {
    return {
        id: row.id,
        teamId: row.team_id,
        userId: row.user_id,
        role: row.role,
        isActive: row.is_active !== 0,
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
class TeamMembershipsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    listForUser(userId) {
        const rows = this.db
            .prepare("SELECT * FROM team_memberships WHERE user_id = ?")
            .all(userId);
        return rows.map(mapMembership);
    }
    listForTeam(teamId) {
        const rows = this.db
            .prepare("SELECT * FROM team_memberships WHERE team_id = ?")
            .all(teamId);
        return rows.map(mapMembership);
    }
    get(teamId, userId) {
        const row = this.db
            .prepare("SELECT * FROM team_memberships WHERE team_id = ? AND user_id = ?")
            .get(teamId, userId);
        return row ? mapMembership(row) : null;
    }
    upsert(input) {
        const existing = this.get(input.teamId, input.userId);
        const now = new Date().toISOString();
        if (existing) {
            this.db
                .prepare(`UPDATE team_memberships
           SET role = ?, is_active = ?, updated_at = ?
           WHERE id = ?`)
                .run(input.role, input.isActive === false ? 0 : 1, now, existing.id);
            return this.get(input.teamId, input.userId);
        }
        const id = (0, crypto_1.randomUUID)();
        this.db
            .prepare(`INSERT INTO team_memberships (
          id, team_id, user_id, role, is_active, created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, input.teamId, input.userId, input.role, input.isActive === false ? 0 : 1, input.createdByUserId ?? null, now, now);
        return this.get(input.teamId, input.userId);
    }
    setActive(teamId, userId, isActive) {
        const now = new Date().toISOString();
        this.db
            .prepare("UPDATE team_memberships SET is_active = ?, updated_at = ? WHERE team_id = ? AND user_id = ?")
            .run(isActive ? 1 : 0, now, teamId, userId);
    }
    remove(teamId, userId) {
        this.db
            .prepare("DELETE FROM team_memberships WHERE team_id = ? AND user_id = ?")
            .run(teamId, userId);
    }
}
exports.TeamMembershipsRepository = TeamMembershipsRepository;
