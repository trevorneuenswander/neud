import { randomUUID } from "crypto";
import type { LocalDatabase } from "../database/connection";
import type { TeamMembershipRecord, TeamRole } from "../services/access-types";

type TeamMembershipRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  is_active: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapMembership(row: TeamMembershipRow): TeamMembershipRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    role: row.role as TeamRole,
    isActive: row.is_active !== 0,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class TeamMembershipsRepository {
  constructor(private readonly db: LocalDatabase) {}

  listForUser(userId: string): TeamMembershipRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM team_memberships WHERE user_id = ?")
      .all(userId) as TeamMembershipRow[];
    return rows.map(mapMembership);
  }

  listForTeam(teamId: string): TeamMembershipRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM team_memberships WHERE team_id = ?")
      .all(teamId) as TeamMembershipRow[];
    return rows.map(mapMembership);
  }

  get(teamId: string, userId: string): TeamMembershipRecord | null {
    const row = this.db
      .prepare("SELECT * FROM team_memberships WHERE team_id = ? AND user_id = ?")
      .get(teamId, userId) as TeamMembershipRow | undefined;
    return row ? mapMembership(row) : null;
  }

  upsert(input: {
    teamId: string;
    userId: string;
    role: TeamRole;
    isActive?: boolean;
    createdByUserId?: string | null;
  }): TeamMembershipRecord {
    const existing = this.get(input.teamId, input.userId);
    const now = new Date().toISOString();
    if (existing) {
      this.db
        .prepare(
          `UPDATE team_memberships
           SET role = ?, is_active = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          input.role,
          input.isActive === false ? 0 : 1,
          now,
          existing.id,
        );
      return this.get(input.teamId, input.userId)!;
    }

    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO team_memberships (
          id, team_id, user_id, role, is_active, created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.teamId,
        input.userId,
        input.role,
        input.isActive === false ? 0 : 1,
        input.createdByUserId ?? null,
        now,
        now,
      );
    return this.get(input.teamId, input.userId)!;
  }

  setActive(teamId: string, userId: string, isActive: boolean): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE team_memberships SET is_active = ?, updated_at = ? WHERE team_id = ? AND user_id = ?",
      )
      .run(isActive ? 1 : 0, now, teamId, userId);
  }

  remove(teamId: string, userId: string): void {
    this.db
      .prepare("DELETE FROM team_memberships WHERE team_id = ? AND user_id = ?")
      .run(teamId, userId);
  }

  removeAllForUser(userId: string): void {
    this.db.prepare("DELETE FROM team_memberships WHERE user_id = ?").run(userId);
  }
}
