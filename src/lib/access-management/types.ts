export type CloudTeamRole = "owner" | "admin" | "member";

export type CloudProjectRole = "manager" | "operator" | "viewer";

export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export type AccessManagementDirectory = {
  ok: boolean;
  syncedAt?: string | null;
  stale?: boolean;
  teams: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isActive: boolean;
    memberCount: number;
  }>;
  teamMemberships: Array<{
    teamId: string;
    userId: string;
    role: CloudTeamRole;
    userName: string;
    userEmail: string;
  }>;
  users: Array<{
    id: string;
    fullName: string;
    email: string;
    platformRole: string;
    team: string;
    accountStatus: string;
  }>;
  projects: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  projectMembers: Array<{
    projectId: string;
    userId: string;
    role: string;
  }>;
  projectTeams: Array<{
    projectId: string;
    teamId: string;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    teamId: string | null;
    platformRole: string | null;
    teamRole: string | null;
    status: InvitationStatus;
    expiresAt: string;
    createdAt: string;
  }>;
};

export type AccessManagementErrorCode =
  | "authentication_required"
  | "forbidden"
  | "insufficient_permissions"
  | "insufficient_access"
  | "outside_team_scope"
  | "cannot_modify_owner"
  | "owner_role_not_assignable"
  | "sole_owner_protected"
  | "owner_team_protected"
  | "invalid_team_role"
  | "last_owner"
  | "invitation_expired"
  | "invitation_revoked"
  | "duplicate_invitation"
  | "offline_required"
  | "conflict"
  | "invalid_request";
