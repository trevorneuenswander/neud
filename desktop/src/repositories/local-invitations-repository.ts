import { randomUUID } from "crypto";
import type { LocalDatabase } from "../database/connection";
import type { TeamRole } from "../services/access-types";

export type LocalInvitationRecord = {
  id: string;
  email: string;
  fullName: string;
  teamId: string;
  teamRole: TeamRole;
  projectIds: string[];
  status: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

type InvitationRow = {
  id: string;
  email: string;
  full_name: string;
  team_id: string;
  team_role: string;
  project_ids_json: string;
  status: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapInvitation(row: InvitationRow): LocalInvitationRecord {
  let projectIds: string[] = [];
  try {
    const parsed = JSON.parse(row.project_ids_json);
    projectIds = Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    projectIds = [];
  }

  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    teamId: row.team_id,
    teamRole: row.team_role as TeamRole,
    projectIds,
    status: row.status,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class LocalInvitationsRepository {
  constructor(private readonly db: LocalDatabase) {}

  listPendingForTeam(teamId: string): LocalInvitationRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM local_invitations WHERE team_id = ? AND status = 'pending' ORDER BY created_at DESC",
      )
      .all(teamId) as InvitationRow[];
    return rows.map(mapInvitation);
  }

  listAll(): LocalInvitationRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM local_invitations ORDER BY created_at DESC")
      .all() as InvitationRow[];
    return rows.map(mapInvitation);
  }

  getByEmail(email: string): LocalInvitationRecord | null {
    const row = this.db
      .prepare("SELECT * FROM local_invitations WHERE email = ? COLLATE NOCASE AND status = 'pending'")
      .get(email.trim()) as InvitationRow | undefined;
    return row ? mapInvitation(row) : null;
  }

  create(input: {
    email: string;
    fullName: string;
    teamId: string;
    teamRole: TeamRole;
    projectIds: string[];
    createdByUserId?: string | null;
  }): LocalInvitationRecord {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO local_invitations (
          id, email, full_name, team_id, team_role, project_ids_json, status,
          created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .run(
        id,
        input.email.trim().toLowerCase(),
        input.fullName.trim(),
        input.teamId,
        input.teamRole,
        JSON.stringify(input.projectIds),
        input.createdByUserId ?? null,
        now,
        now,
      );
    return mapInvitation(
      this.db.prepare("SELECT * FROM local_invitations WHERE id = ?").get(id) as InvitationRow,
    );
  }

  markAccepted(invitationId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE local_invitations SET status = 'accepted', updated_at = ? WHERE id = ?")
      .run(now, invitationId);
  }
}
