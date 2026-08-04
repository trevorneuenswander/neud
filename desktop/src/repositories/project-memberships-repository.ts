import { randomUUID } from "crypto";
import type { LocalDatabase } from "../database/connection";
import type { ProjectAccessRole, ProjectMembershipRecord } from "../services/access-types";

type ProjectMembershipRow = {
  id: string;
  project_id: string;
  team_id: string;
  user_id: string;
  access_role: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapMembership(row: ProjectMembershipRow): ProjectMembershipRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    teamId: row.team_id,
    userId: row.user_id,
    accessRole: row.access_role as ProjectAccessRole,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProjectMembershipsRepository {
  constructor(private readonly db: LocalDatabase) {}

  listForUser(userId: string): ProjectMembershipRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM project_memberships WHERE user_id = ?")
      .all(userId) as ProjectMembershipRow[];
    return rows.map(mapMembership);
  }

  listForProject(projectId: string): ProjectMembershipRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM project_memberships WHERE project_id = ?")
      .all(projectId) as ProjectMembershipRow[];
    return rows.map(mapMembership);
  }

  listForProjectTeam(projectId: string, teamId: string): ProjectMembershipRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM project_memberships WHERE project_id = ? AND team_id = ?",
      )
      .all(projectId, teamId) as ProjectMembershipRow[];
    return rows.map(mapMembership);
  }

  get(projectId: string, teamId: string, userId: string): ProjectMembershipRecord | null {
    const row = this.db
      .prepare(
        "SELECT * FROM project_memberships WHERE project_id = ? AND team_id = ? AND user_id = ?",
      )
      .get(projectId, teamId, userId) as ProjectMembershipRow | undefined;
    return row ? mapMembership(row) : null;
  }

  getAnyForProjectUser(projectId: string, userId: string): ProjectMembershipRecord | null {
    const row = this.db
      .prepare(
        "SELECT * FROM project_memberships WHERE project_id = ? AND user_id = ? LIMIT 1",
      )
      .get(projectId, userId) as ProjectMembershipRow | undefined;
    return row ? mapMembership(row) : null;
  }

  countForUser(userId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM project_memberships WHERE user_id = ?")
      .get(userId) as { count: number };
    return row.count;
  }

  upsert(input: {
    projectId: string;
    teamId: string;
    userId: string;
    accessRole: ProjectAccessRole;
    createdByUserId?: string | null;
  }): ProjectMembershipRecord {
    const existing = this.get(input.projectId, input.teamId, input.userId);
    const now = new Date().toISOString();
    if (existing) {
      this.db
        .prepare(
          "UPDATE project_memberships SET access_role = ?, updated_at = ? WHERE id = ?",
        )
        .run(input.accessRole, now, existing.id);
      return this.get(input.projectId, input.teamId, input.userId)!;
    }

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO project_memberships (
          id, project_id, team_id, user_id, access_role, created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId,
        input.teamId,
        input.userId,
        input.accessRole,
        input.createdByUserId ?? null,
        now,
        now,
      );
    return this.get(input.projectId, input.teamId, input.userId)!;
  }

  remove(projectId: string, teamId: string, userId: string): void {
    this.db
      .prepare(
        "DELETE FROM project_memberships WHERE project_id = ? AND team_id = ? AND user_id = ?",
      )
      .run(projectId, teamId, userId);
  }

  removeAllForProjectTeam(projectId: string, teamId: string): void {
    this.db
      .prepare("DELETE FROM project_memberships WHERE project_id = ? AND team_id = ?")
      .run(projectId, teamId);
  }

  removeAllForProject(projectId: string): void {
    this.db.prepare("DELETE FROM project_memberships WHERE project_id = ?").run(projectId);
  }
}
