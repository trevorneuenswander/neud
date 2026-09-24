import { randomUUID } from "crypto";
import type { LocalDatabase } from "../database/connection";
import type { TeamRecord } from "../services/access-types";

type TeamRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapTeam(row: TeamRow): TeamRecord {
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

export class TeamsRepository {
  constructor(private readonly db: LocalDatabase) {}

  countAll(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM teams").get() as {
      count: number;
    };
    return row.count;
  }

  getById(teamId: string): TeamRecord | null {
    const row = this.db.prepare("SELECT * FROM teams WHERE id = ?").get(teamId) as
      | TeamRow
      | undefined;
    return row ? mapTeam(row) : null;
  }

  getByName(name: string): TeamRecord | null {
    const row = this.db
      .prepare("SELECT * FROM teams WHERE name = ? COLLATE NOCASE")
      .get(name.trim()) as TeamRow | undefined;
    return row ? mapTeam(row) : null;
  }

  listAll(): TeamRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM teams ORDER BY name COLLATE NOCASE ASC")
      .all() as TeamRow[];
    return rows.map(mapTeam);
  }

  create(input: {
    name: string;
    description?: string | null;
    createdByUserId?: string | null;
  }): TeamRecord {
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
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO teams (
          id, name, description, is_active, created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, 1, ?, ?, ?)`,
      )
      .run(
        id,
        trimmedName,
        input.description?.trim() || null,
        input.createdByUserId ?? null,
        now,
        now,
      );
    return this.getById(id)!;
  }

  update(
    teamId: string,
    input: { name?: string; description?: string | null; isActive?: boolean },
  ): TeamRecord | null {
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
      .prepare(
        `UPDATE teams
         SET name = ?, description = ?, is_active = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        nextName,
        input.description !== undefined
          ? input.description?.trim() || null
          : existing.description,
        input.isActive === undefined ? (existing.isActive ? 1 : 0) : input.isActive ? 1 : 0,
        now,
        teamId,
      );
    return this.getById(teamId);
  }

  countUsers(teamId: string): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM team_memberships WHERE team_id = ? AND is_active = 1",
      )
      .get(teamId) as { count: number };
    return row.count;
  }

  countAdmins(teamId: string): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM team_memberships WHERE team_id = ? AND role = 'admin' AND is_active = 1",
      )
      .get(teamId) as { count: number };
    return row.count;
  }

  countProjects(teamId: string): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(DISTINCT project_id) AS count FROM project_team_assignments WHERE team_id = ?",
      )
      .get(teamId) as { count: number };
    return row.count;
  }

  deleteById(teamId: string): void {
    this.db.prepare("DELETE FROM teams WHERE id = ?").run(teamId);
  }
}
