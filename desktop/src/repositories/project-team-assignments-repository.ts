import { randomUUID } from "crypto";
import type { LocalDatabase } from "../database/connection";

export type ProjectTeamAssignmentRecord = {
  id: string;
  projectId: string;
  teamId: string;
  createdByUserId: string | null;
  createdAt: string;
};

type AssignmentRow = {
  id: string;
  project_id: string;
  team_id: string;
  created_by_user_id: string | null;
  created_at: string;
};

function mapRow(row: AssignmentRow): ProjectTeamAssignmentRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    teamId: row.team_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}

export class ProjectTeamAssignmentsRepository {
  constructor(private readonly db: LocalDatabase) {}

  listForProject(projectId: string): ProjectTeamAssignmentRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM project_team_assignments WHERE project_id = ? ORDER BY created_at ASC",
      )
      .all(projectId) as AssignmentRow[];
    return rows.map(mapRow);
  }

  listForTeam(teamId: string): ProjectTeamAssignmentRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM project_team_assignments WHERE team_id = ?")
      .all(teamId) as AssignmentRow[];
    return rows.map(mapRow);
  }

  getTeamIdsForProject(projectId: string): string[] {
    return this.listForProject(projectId).map((entry) => entry.teamId);
  }

  getProjectIdsForTeam(teamId: string): string[] {
    return this.listForTeam(teamId).map((entry) => entry.projectId);
  }

  countProjectsForTeam(teamId: string): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(DISTINCT project_id) AS count FROM project_team_assignments WHERE team_id = ?",
      )
      .get(teamId) as { count: number };
    return row.count;
  }

  isAssigned(projectId: string, teamId: string): boolean {
    const row = this.db
      .prepare(
        "SELECT id FROM project_team_assignments WHERE project_id = ? AND team_id = ?",
      )
      .get(projectId, teamId) as { id: string } | undefined;
    return Boolean(row);
  }

  assign(input: {
    projectId: string;
    teamId: string;
    createdByUserId?: string | null;
  }): ProjectTeamAssignmentRecord {
    const existing = this.db
      .prepare(
        "SELECT * FROM project_team_assignments WHERE project_id = ? AND team_id = ?",
      )
      .get(input.projectId, input.teamId) as AssignmentRow | undefined;
    if (existing) {
      return mapRow(existing);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO project_team_assignments (
          id, project_id, team_id, created_by_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, input.projectId, input.teamId, input.createdByUserId ?? null, now);

    return this.listForProject(input.projectId).find((entry) => entry.id === id)!;
  }

  remove(projectId: string, teamId: string): void {
    this.db
      .prepare("DELETE FROM project_team_assignments WHERE project_id = ? AND team_id = ?")
      .run(projectId, teamId);
  }

  setTeamsForProject(
    projectId: string,
    teamIds: string[],
    createdByUserId?: string | null,
  ): string[] {
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

  listTeamsByProjectIds(projectIds: string[]): Map<string, string[]> {
    if (projectIds.length === 0) {
      return new Map();
    }

    const placeholders = projectIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT project_id, team_id FROM project_team_assignments
         WHERE project_id IN (${placeholders})
         ORDER BY project_id ASC, team_id ASC`,
      )
      .all(...projectIds) as Array<{ project_id: string; team_id: string }>;

    const map = new Map<string, string[]>();
    for (const row of rows) {
      const current = map.get(row.project_id) ?? [];
      current.push(row.team_id);
      map.set(row.project_id, current);
    }
    return map;
  }
}
