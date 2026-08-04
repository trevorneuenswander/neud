"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalInvitationsRepository = void 0;
const crypto_1 = require("crypto");
function mapInvitation(row) {
    let projectIds = [];
    try {
        const parsed = JSON.parse(row.project_ids_json);
        projectIds = Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
    }
    catch {
        projectIds = [];
    }
    return {
        id: row.id,
        email: row.email,
        fullName: row.full_name,
        teamId: row.team_id,
        teamRole: row.team_role,
        projectIds,
        status: row.status,
        createdByUserId: row.created_by_user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
class LocalInvitationsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    listPendingForTeam(teamId) {
        const rows = this.db
            .prepare("SELECT * FROM local_invitations WHERE team_id = ? AND status = 'pending' ORDER BY created_at DESC")
            .all(teamId);
        return rows.map(mapInvitation);
    }
    listAll() {
        const rows = this.db
            .prepare("SELECT * FROM local_invitations ORDER BY created_at DESC")
            .all();
        return rows.map(mapInvitation);
    }
    getByEmail(email) {
        const row = this.db
            .prepare("SELECT * FROM local_invitations WHERE email = ? COLLATE NOCASE AND status = 'pending'")
            .get(email.trim());
        return row ? mapInvitation(row) : null;
    }
    create(input) {
        const now = new Date().toISOString();
        const id = (0, crypto_1.randomUUID)();
        this.db
            .prepare(`INSERT INTO local_invitations (
          id, email, full_name, team_id, team_role, project_ids_json, status,
          created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`)
            .run(id, input.email.trim().toLowerCase(), input.fullName.trim(), input.teamId, input.teamRole, JSON.stringify(input.projectIds), input.createdByUserId ?? null, now, now);
        return mapInvitation(this.db.prepare("SELECT * FROM local_invitations WHERE id = ?").get(id));
    }
    markAccepted(invitationId) {
        const now = new Date().toISOString();
        this.db
            .prepare("UPDATE local_invitations SET status = 'accepted', updated_at = ? WHERE id = ?")
            .run(now, invitationId);
    }
}
exports.LocalInvitationsRepository = LocalInvitationsRepository;
