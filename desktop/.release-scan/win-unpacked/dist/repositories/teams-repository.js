"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamsRepository = void 0;
const crypto_1 = require("crypto");
function mapTeam(row) {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        isActive: row.is_active !== 0,
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
class TeamsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    countAll() {
        const row = this.db.prepare("SELECT COUNT(*) AS count FROM teams").get();
        return row.count;
    }
    getById(teamId) {
        const row = this.db.prepare("SELECT * FROM teams WHERE id = ?").get(teamId);
        return row ? mapTeam(row) : null;
    }
    getByName(name) {
        const row = this.db
            .prepare("SELECT * FROM teams WHERE name = ? COLLATE NOCASE")
            .get(name.trim());
        return row ? mapTeam(row) : null;
    }
    listAll() {
        const rows = this.db
            .prepare("SELECT * FROM teams ORDER BY name COLLATE NOCASE ASC")
            .all();
        return rows.map(mapTeam);
    }
    create(input) {
        const trimmedName = input.name.trim();
        if (!trimmedName) {
            throw new Error("Team name is required.");
        }
        if (trimmedName.length > 120) {
            throw new Error("Team name must be 120 characters or fewer.");
        }
        if (this.getByName(trimmedName)) {
            throw new Error("A team with this name already exists.");
        }
        const now = new Date().toISOString();
        const id = (0, crypto_1.randomUUID)();
        this.db
            .prepare(`INSERT INTO teams (
          id, name, description, is_active, created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, 1, ?, ?, ?)`)
            .run(id, trimmedName, input.description?.trim() || null, input.createdByUserId ?? null, now, now);
        return this.getById(id);
    }
    update(teamId, input) {
        const existing = this.getById(teamId);
        if (!existing) {
            return null;
        }
        const nextName = input.name !== undefined ? input.name.trim() : existing.name;
        if (!nextName) {
            throw new Error("Team name is required.");
        }
        if (nextName.length > 120) {
            throw new Error("Team name must be 120 characters or fewer.");
        }
        const duplicate = this.getByName(nextName);
        if (duplicate && duplicate.id !== teamId) {
            throw new Error("A team with this name already exists.");
        }
        const now = new Date().toISOString();
        this.db
            .prepare(`UPDATE teams
         SET name = ?, description = ?, is_active = ?, updated_at = ?
         WHERE id = ?`)
            .run(nextName, input.description !== undefined
            ? input.description?.trim() || null
            : existing.description, input.isActive === undefined ? (existing.isActive ? 1 : 0) : input.isActive ? 1 : 0, now, teamId);
        return this.getById(teamId);
    }
    countUsers(teamId) {
        const row = this.db
            .prepare("SELECT COUNT(*) AS count FROM team_memberships WHERE team_id = ? AND is_active = 1")
            .get(teamId);
        return row.count;
    }
    countAdmins(teamId) {
        const row = this.db
            .prepare("SELECT COUNT(*) AS count FROM team_memberships WHERE team_id = ? AND role = 'admin' AND is_active = 1")
            .get(teamId);
        return row.count;
    }
    countProjects(teamId) {
        const row = this.db
            .prepare("SELECT COUNT(DISTINCT project_id) AS count FROM project_team_assignments WHERE team_id = ?")
            .get(teamId);
        return row.count;
    }
}
exports.TeamsRepository = TeamsRepository;
