"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectsRepository = void 0;
const crypto_1 = require("crypto");
class ProjectsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    list() {
        const rows = this.db
            .prepare("SELECT * FROM projects ORDER BY project_number ASC, name ASC")
            .all();
        return rows.map(mapProjectRow);
    }
    getBySlug(slug) {
        const row = this.db
            .prepare("SELECT * FROM projects WHERE slug = ?")
            .get(slug);
        return row ? mapProjectRow(row) : null;
    }
    getById(id) {
        const row = this.db
            .prepare("SELECT * FROM projects WHERE id = ?")
            .get(id);
        return row ? mapProjectRow(row) : null;
    }
    setTeamId(projectId, teamId) {
        const now = new Date().toISOString();
        this.db
            .prepare("UPDATE projects SET team_id = ?, updated_at = ? WHERE id = ?")
            .run(teamId, now, projectId);
    }
    listByTeamId(teamId) {
        const rows = this.db
            .prepare(`SELECT p.* FROM projects p
         INNER JOIN project_team_assignments pta ON pta.project_id = p.id
         WHERE pta.team_id = ?
         ORDER BY p.name ASC`)
            .all(teamId);
        return rows.map(mapProjectRow);
    }
    create(input) {
        const now = new Date().toISOString();
        const nextNumber = this.db
            .prepare("SELECT MAX(project_number) AS max_number FROM projects")
            .get().max_number ?? 0;
        const project = {
            id: (0, crypto_1.randomUUID)(),
            projectNumber: nextNumber + 1,
            name: input.name.trim(),
            slug: input.slug.trim(),
            description: input.description?.trim() ?? null,
            projectType: input.projectType,
            status: "active",
            isActive: true,
            displayToken: (0, crypto_1.randomUUID)(),
            theme: input.theme ?? "default",
            logoUrl: null,
            primaryColor: null,
            secondaryColor: null,
            icon: input.icon ?? "folder",
            settings: {},
            metadata: {},
            archivedAt: null,
            teamId: null,
            createdAt: now,
            updatedAt: now,
        };
        this.db
            .prepare(`INSERT INTO projects (
          id, project_number, name, slug, description, project_type, status, is_active,
          display_token, theme, logo_url, primary_color, secondary_color, icon,
          settings_json, metadata_json, archived_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(project.id, project.projectNumber, project.name, project.slug, project.description, project.projectType, project.status, project.isActive ? 1 : 0, project.displayToken, project.theme, project.logoUrl, project.primaryColor, project.secondaryColor, project.icon, JSON.stringify(project.settings), JSON.stringify(project.metadata), project.archivedAt, project.createdAt, project.updatedAt);
        return project;
    }
    slugExists(slug) {
        const row = this.db
            .prepare("SELECT id FROM projects WHERE slug = ?")
            .get(slug);
        return Boolean(row);
    }
    search(query) {
        const projects = this.list();
        const trimmed = query?.trim().toLowerCase() ?? "";
        if (!trimmed)
            return projects;
        return projects.filter((project) => project.name.toLowerCase().includes(trimmed));
    }
    updateSettings(id, input) {
        const existing = this.getById(id);
        if (!existing) {
            return null;
        }
        const now = new Date().toISOString();
        const description = input.description === undefined
            ? existing.description
            : input.description?.trim()
                ? input.description.trim()
                : null;
        this.db
            .prepare("UPDATE projects SET name = ?, description = ?, is_active = ?, updated_at = ? WHERE id = ?")
            .run(input.name.trim(), description, input.isActive ? 1 : 0, now, id);
        return this.getById(id);
    }
    delete(id) {
        this.db.transaction(() => {
            this.db.prepare("DELETE FROM import_history WHERE local_project_id = ?").run(id);
            this.db.prepare("DELETE FROM bag_manual_events WHERE project_id = ?").run(id);
            this.db.prepare("DELETE FROM bag_live_state WHERE project_id = ?").run(id);
            const engineRows = this.db
                .prepare("SELECT id FROM data_sources WHERE project_id = ?")
                .all(id);
            for (const row of engineRows) {
                this.db.prepare("DELETE FROM data_source_logs WHERE source_id = ?").run(row.id);
                this.db
                    .prepare("DELETE FROM data_source_snapshots WHERE source_id = ?")
                    .run(row.id);
                this.db.prepare("DELETE FROM data_source_status WHERE source_id = ?").run(row.id);
                this.db
                    .prepare("DELETE FROM data_source_sources WHERE source_id = ?")
                    .run(row.id);
                this.db
                    .prepare("DELETE FROM data_source_settings WHERE source_id = ?")
                    .run(row.id);
            }
            this.db.prepare("DELETE FROM data_sources WHERE project_id = ?").run(id);
            const displayRows = this.db
                .prepare("SELECT id FROM displays WHERE project_id = ?")
                .all(id);
            for (const row of displayRows) {
                this.db.prepare("DELETE FROM display_settings WHERE display_id = ?").run(row.id);
            }
            this.db.prepare("DELETE FROM displays WHERE project_id = ?").run(id);
            const controllerRows = this.db
                .prepare("SELECT id FROM controllers WHERE project_id = ?")
                .all(id);
            for (const row of controllerRows) {
                this.db
                    .prepare("DELETE FROM controller_settings WHERE controller_id = ?")
                    .run(row.id);
            }
            this.db.prepare("DELETE FROM controllers WHERE project_id = ?").run(id);
            this.db.prepare("DELETE FROM assets WHERE project_id = ?").run(id);
            const targetRows = this.db
                .prepare("SELECT id FROM publishing_targets WHERE project_id = ?")
                .all(id);
            for (const row of targetRows) {
                this.db
                    .prepare("DELETE FROM publishing_sessions WHERE target_id = ?")
                    .run(row.id);
            }
            this.db.prepare("DELETE FROM publishing_targets WHERE project_id = ?").run(id);
            this.db.prepare("DELETE FROM project_settings WHERE project_id = ?").run(id);
            this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
        });
    }
}
exports.ProjectsRepository = ProjectsRepository;
function mapProjectRow(row) {
    return {
        id: row.id,
        projectNumber: row.project_number,
        name: row.name,
        slug: row.slug,
        description: row.description,
        projectType: row.project_type,
        status: row.status,
        isActive: row.is_active !== 0,
        teamId: row.team_id ?? null,
        displayToken: row.display_token,
        theme: row.theme,
        logoUrl: row.logo_url,
        primaryColor: row.primary_color,
        secondaryColor: row.secondary_color,
        icon: row.icon,
        settings: parseJsonObject(row.settings_json),
        metadata: parseJsonObject(row.metadata_json),
        archivedAt: row.archived_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
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
