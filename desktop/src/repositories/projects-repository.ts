import { randomUUID } from "crypto";
import type { LocalDatabase } from "../database/connection";

export type LocalProject = {
  id: string;
  projectNumber: number | null;
  name: string;
  slug: string;
  description: string | null;
  projectType: string;
  status: string;
  isActive: boolean;
  teamId: string | null;
  displayToken: string | null;
  theme: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  icon: string | null;
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProjectRow = {
  id: string;
  project_number: number | null;
  name: string;
  slug: string;
  description: string | null;
  project_type: string;
  status: string;
  is_active: number;
  display_token: string | null;
  theme: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  icon: string | null;
  settings_json: string;
  metadata_json: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  team_id?: string | null;
};

export class ProjectsRepository {
  constructor(private readonly db: LocalDatabase) {}

  list(): LocalProject[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM projects ORDER BY project_number ASC, name ASC",
      )
      .all() as ProjectRow[];
    return rows.map(mapProjectRow);
  }

  getBySlug(slug: string): LocalProject | null {
    const row = this.db
      .prepare("SELECT * FROM projects WHERE slug = ?")
      .get(slug) as ProjectRow | undefined;
    return row ? mapProjectRow(row) : null;
  }

  getById(id: string): LocalProject | null {
    const row = this.db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as ProjectRow | undefined;
    return row ? mapProjectRow(row) : null;
  }

  setTeamId(projectId: string, teamId: string | null): void {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE projects SET team_id = ?, updated_at = ? WHERE id = ?")
      .run(teamId, now, projectId);
  }

  listByTeamId(teamId: string): LocalProject[] {
    const rows = this.db
      .prepare(
        `SELECT p.* FROM projects p
         INNER JOIN project_team_assignments pta ON pta.project_id = p.id
         WHERE pta.team_id = ?
         ORDER BY p.name ASC`,
      )
      .all(teamId) as ProjectRow[];
    return rows.map(mapProjectRow);
  }

  create(input: {
    name: string;
    slug: string;
    projectType: string;
    description?: string | null;
    theme?: string;
    icon?: string;
  }): LocalProject {
    const now = new Date().toISOString();
    const nextNumber =
      (
        this.db
          .prepare("SELECT MAX(project_number) AS max_number FROM projects")
          .get() as { max_number: number | null }
      ).max_number ?? 0;

    const project: LocalProject = {
      id: randomUUID(),
      projectNumber: nextNumber + 1,
      name: input.name.trim(),
      slug: input.slug.trim(),
      description: input.description?.trim() ?? null,
      projectType: input.projectType,
      status: "active",
      isActive: true,
      displayToken: randomUUID(),
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
      .prepare(
        `INSERT INTO projects (
          id, project_number, name, slug, description, project_type, status, is_active,
          display_token, theme, logo_url, primary_color, secondary_color, icon,
          settings_json, metadata_json, archived_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        project.id,
        project.projectNumber,
        project.name,
        project.slug,
        project.description,
        project.projectType,
        project.status,
        project.isActive ? 1 : 0,
        project.displayToken,
        project.theme,
        project.logoUrl,
        project.primaryColor,
        project.secondaryColor,
        project.icon,
        JSON.stringify(project.settings),
        JSON.stringify(project.metadata),
        project.archivedAt,
        project.createdAt,
        project.updatedAt,
      );

    return project;
  }

  slugExists(slug: string): boolean {
    const row = this.db
      .prepare("SELECT id FROM projects WHERE slug = ?")
      .get(slug) as { id: string } | undefined;
    return Boolean(row);
  }

  /** Align local SQLite project identity to an existing hosted project row (same slug). */
  realignProjectId(localProjectId: string, hostedProjectId: string): void {
    if (localProjectId === hostedProjectId) {
      return;
    }
    if (!this.getById(localProjectId)) {
      throw new Error("Local project not found for identity realignment.");
    }
    if (this.getById(hostedProjectId)) {
      throw new Error("Target hosted project id already exists locally.");
    }

    this.db.transaction(() => {
      this.db.exec("PRAGMA foreign_keys = OFF");
      const tables = [
        "import_history",
        "bag_manual_events",
        "bag_live_state",
        "data_sources",
        "displays",
        "controllers",
        "assets",
        "publishing_targets",
        "project_settings",
        "project_memberships",
        "project_display_code",
        "project_scraper_code",
        "project_code_revisions",
        "project_validation_logs",
        "display_deletion_tombstones",
        "project_team_assignments",
        "local_project_memberships",
        "user_display_order",
        "user_pinned_viewer_preferences",
      ] as const;

      for (const table of tables) {
        const column = table === "import_history" ? "local_project_id" : "project_id";
        this.db
          .prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`)
          .run(hostedProjectId, localProjectId);
      }

      this.db
        .prepare("UPDATE projects SET id = ? WHERE id = ?")
        .run(hostedProjectId, localProjectId);

      this.db
        .prepare(
          `UPDATE activity_events
           SET metadata_json = json_set(metadata_json, '$.projectId', ?)
           WHERE json_extract(metadata_json, '$.projectId') = ?`,
        )
        .run(hostedProjectId, localProjectId);

      this.db.exec("PRAGMA foreign_keys = ON");
    });
  }

  search(query?: string): LocalProject[] {
    const projects = this.list();
    const trimmed = query?.trim().toLowerCase() ?? "";
    if (!trimmed) return projects;
    return projects.filter((project) =>
      project.name.toLowerCase().includes(trimmed),
    );
  }

  updateSettings(
    id: string,
    input: { name: string; isActive: boolean; description?: string | null },
  ): LocalProject | null {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const description =
      input.description === undefined
        ? existing.description
        : input.description?.trim()
          ? input.description.trim()
          : null;

    this.db
      .prepare(
        "UPDATE projects SET name = ?, description = ?, is_active = ?, updated_at = ? WHERE id = ?",
      )
      .run(input.name.trim(), description, input.isActive ? 1 : 0, now, id);

    return this.getById(id);
  }

  delete(id: string) {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM import_history WHERE local_project_id = ?").run(id);
      this.db.prepare("DELETE FROM bag_manual_events WHERE project_id = ?").run(id);
      this.db.prepare("DELETE FROM bag_live_state WHERE project_id = ?").run(id);

      const engineRows = this.db
        .prepare("SELECT id FROM data_sources WHERE project_id = ?")
        .all(id) as { id: string }[];

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
        .all(id) as { id: string }[];
      for (const row of displayRows) {
        this.db.prepare("DELETE FROM display_settings WHERE display_id = ?").run(row.id);
      }
      this.db.prepare("DELETE FROM displays WHERE project_id = ?").run(id);

      const controllerRows = this.db
        .prepare("SELECT id FROM controllers WHERE project_id = ?")
        .all(id) as { id: string }[];
      for (const row of controllerRows) {
        this.db
          .prepare("DELETE FROM controller_settings WHERE controller_id = ?")
          .run(row.id);
      }
      this.db.prepare("DELETE FROM controllers WHERE project_id = ?").run(id);

      this.db.prepare("DELETE FROM assets WHERE project_id = ?").run(id);

      const targetRows = this.db
        .prepare("SELECT id FROM publishing_targets WHERE project_id = ?")
        .all(id) as { id: string }[];
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

function mapProjectRow(row: ProjectRow): LocalProject {
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

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
