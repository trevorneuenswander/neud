import type { LocalDatabase } from "../database/connection";
import type { ProjectRole } from "../projects/project-permissions";

export type LocalProjectMembership = {
  projectId: string;
  userId: string;
  role: ProjectRole;
  createdAt: string;
  updatedAt: string;
};

export class LocalProjectMembershipsRepository {
  constructor(private readonly db: LocalDatabase) {}

  countForProject(projectId: string): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM local_project_memberships WHERE project_id = ?",
      )
      .get(projectId) as { count: number };
    return row.count;
  }

  countForUser(userId: string): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM local_project_memberships WHERE user_id = ?",
      )
      .get(userId) as { count: number };
    return row.count;
  }

  getProjectRole(userId: string, projectId: string): ProjectRole | null {
    const row = this.db
      .prepare(
        "SELECT role FROM local_project_memberships WHERE user_id = ? AND project_id = ?",
      )
      .get(userId, projectId) as { role: string } | undefined;

    if (!row) {
      return null;
    }

    return normalizeRole(row.role);
  }

  listAll(): LocalProjectMembership[] {
    const rows = this.db
      .prepare("SELECT project_id, user_id, role, created_at, updated_at FROM local_project_memberships")
      .all() as Array<{
      project_id: string;
      user_id: string;
      role: string;
      created_at: string;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      projectId: row.project_id,
      userId: row.user_id,
      role: normalizeRole(row.role),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  ensureLegacyLocalOwnerMembership(projectId: string, userId: string): boolean {
    if (this.countForProject(projectId) > 0) {
      return false;
    }
    return this.ensureOwnerMembership(projectId, userId);
  }

  ensureOwnerMembership(projectId: string, userId: string): boolean {
    const existing = this.db
      .prepare(
        "SELECT role FROM local_project_memberships WHERE user_id = ? AND project_id = ?",
      )
      .get(userId, projectId) as { role: string } | undefined;

    if (existing) {
      return false;
    }

    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO local_project_memberships (
          project_id, user_id, role, created_at, updated_at
        ) VALUES (?, ?, 'owner', ?, ?)`,
      )
      .run(projectId, userId, now, now);
    return true;
  }
}

function normalizeRole(value: string): ProjectRole {
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
