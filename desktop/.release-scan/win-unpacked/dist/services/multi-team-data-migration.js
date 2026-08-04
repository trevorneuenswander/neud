"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMultiTeamDataMigration = runMultiTeamDataMigration;
const crypto_1 = require("crypto");
const MULTI_TEAM_MIGRATION_KEY = "multi_team_migration_v1";
function tableHasColumn(db, table, column) {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    return rows.some((row) => row.name === column);
}
function runMultiTeamDataMigration(db) {
    const marker = db
        .prepare("SELECT value_json FROM app_settings WHERE key = ?")
        .get(MULTI_TEAM_MIGRATION_KEY);
    if (marker) {
        try {
            if (JSON.parse(marker.value_json) === "done") {
                return;
            }
        }
        catch {
            // continue
        }
    }
    db.transaction(() => {
        copyLegacyProjectTeams(db);
        rebuildTeamScopedProjectMemberships(db);
        db.prepare(`INSERT INTO app_settings (key, value_json, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`).run(MULTI_TEAM_MIGRATION_KEY, JSON.stringify("done"));
    });
    console.info("[multi-team-migration] Project team assignments migration completed.");
}
function copyLegacyProjectTeams(db) {
    const projects = db
        .prepare("SELECT id, team_id FROM projects WHERE team_id IS NOT NULL")
        .all();
    for (const project of projects) {
        const existing = db
            .prepare("SELECT id FROM project_team_assignments WHERE project_id = ? AND team_id = ?")
            .get(project.id, project.team_id);
        if (existing) {
            continue;
        }
        db.prepare(`INSERT INTO project_team_assignments (
        id, project_id, team_id, created_by_user_id, created_at
      ) VALUES (?, ?, ?, NULL, datetime('now'))`).run((0, crypto_1.randomUUID)(), project.id, project.team_id);
    }
}
function rebuildTeamScopedProjectMemberships(db) {
    if (tableHasColumn(db, "project_memberships", "team_id")) {
        return;
    }
    const legacyRows = db.prepare("SELECT * FROM project_memberships").all();
    db.exec(`
    CREATE TABLE project_memberships_v2 (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
      team_id TEXT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES local_users (id) ON DELETE CASCADE,
      access_role TEXT NOT NULL CHECK (access_role IN ('operator', 'viewer')),
      created_by_user_id TEXT REFERENCES local_users (id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (project_id, team_id, user_id)
    )
  `);
    const insert = db.prepare(`INSERT OR IGNORE INTO project_memberships_v2 (
      id, project_id, team_id, user_id, access_role, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const row of legacyRows) {
        const teamId = resolveMembershipTeamId(db, row.project_id, row.user_id);
        if (!teamId) {
            console.warn(`[multi-team-migration] Skipped unscoped membership project=${row.project_id} user=${row.user_id}`);
            continue;
        }
        insert.run(row.id, row.project_id, teamId, row.user_id, row.access_role, row.created_by_user_id, row.created_at, row.updated_at);
    }
    db.exec("DROP TABLE project_memberships");
    db.exec("ALTER TABLE project_memberships_v2 RENAME TO project_memberships");
    db.exec("CREATE INDEX IF NOT EXISTS idx_project_memberships_user ON project_memberships (user_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_project_memberships_project ON project_memberships (project_id)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_project_memberships_team ON project_memberships (team_id)");
}
function resolveMembershipTeamId(db, projectId, userId) {
    const sharedTeam = db
        .prepare(`SELECT tm.team_id AS team_id
       FROM team_memberships tm
       INNER JOIN project_team_assignments pta
         ON pta.team_id = tm.team_id AND pta.project_id = ?
       WHERE tm.user_id = ? AND tm.is_active = 1
       ORDER BY tm.created_at ASC
       LIMIT 1`)
        .get(projectId, userId);
    if (sharedTeam?.team_id) {
        return sharedTeam.team_id;
    }
    const projectTeam = db
        .prepare(`SELECT team_id FROM project_team_assignments
       WHERE project_id = ?
       ORDER BY created_at ASC
       LIMIT 1`)
        .get(projectId);
    if (projectTeam?.team_id) {
        const userOnTeam = db
            .prepare("SELECT team_id FROM team_memberships WHERE team_id = ? AND user_id = ? AND is_active = 1")
            .get(projectTeam.team_id, userId);
        if (userOnTeam) {
            return projectTeam.team_id;
        }
    }
    const legacyProjectTeam = db
        .prepare("SELECT team_id FROM projects WHERE id = ?")
        .get(projectId);
    return legacyProjectTeam?.team_id ?? null;
}
