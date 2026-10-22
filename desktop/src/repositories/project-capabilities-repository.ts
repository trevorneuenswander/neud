import type { LocalDatabase } from "../database/connection";
import {
  defaultCapabilitiesForProjectType,
  normalizeCapabilityIds,
  type ProjectCapabilityId,
} from "../projects/project-capabilities";

export type ProjectCapabilityRow = {
  projectId: string;
  capability: ProjectCapabilityId;
  createdAt: string;
  createdBy: string | null;
};

export class ProjectCapabilitiesRepository {
  constructor(private readonly db: LocalDatabase) {}

  listForProject(projectId: string): ProjectCapabilityId[] {
    const rows = this.db
      .prepare(
        "SELECT capability FROM project_capabilities WHERE project_id = ? ORDER BY capability ASC",
      )
      .all(projectId) as Array<{ capability: string }>;
    return normalizeCapabilityIds(rows.map((row) => row.capability));
  }

  listForProjects(projectIds: string[]): Map<string, ProjectCapabilityId[]> {
    const map = new Map<string, ProjectCapabilityId[]>();
    if (projectIds.length === 0) {
      return map;
    }
    const placeholders = projectIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT project_id, capability FROM project_capabilities
         WHERE project_id IN (${placeholders})
         ORDER BY project_id ASC, capability ASC`,
      )
      .all(...projectIds) as Array<{ project_id: string; capability: string }>;

    for (const row of rows) {
      const list = map.get(row.project_id) ?? [];
      const normalized = normalizeCapabilityIds([row.capability]);
      if (normalized[0]) {
        list.push(normalized[0]);
      }
      map.set(row.project_id, list);
    }
    return map;
  }

  replaceForProject(
    projectId: string,
    capabilities: readonly ProjectCapabilityId[],
    createdBy?: string | null,
  ): ProjectCapabilityId[] {
    const next = normalizeCapabilityIds(capabilities);
    if (next.length === 0) {
      throw new Error(
        "Select at least one capability. Use Display Only for a blank graphics project.",
      );
    }

    const now = new Date().toISOString();
    this.db
      .prepare("DELETE FROM project_capabilities WHERE project_id = ?")
      .run(projectId);

    const insert = this.db.prepare(
      `INSERT INTO project_capabilities (project_id, capability, created_at, created_by)
       VALUES (?, ?, ?, ?)`,
    );
    for (const capability of next) {
      insert.run(projectId, capability, now, createdBy ?? null);
    }
    return next;
  }

  ensureDefaultsForProject(
    projectId: string,
    projectType: string,
    createdBy?: string | null,
  ): ProjectCapabilityId[] {
    const existing = this.listForProject(projectId);
    if (existing.length > 0) {
      return existing;
    }
    return this.replaceForProject(
      projectId,
      defaultCapabilitiesForProjectType(projectType),
      createdBy,
    );
  }

  removeAllForProject(projectId: string): void {
    this.db
      .prepare("DELETE FROM project_capabilities WHERE project_id = ?")
      .run(projectId);
  }
}
