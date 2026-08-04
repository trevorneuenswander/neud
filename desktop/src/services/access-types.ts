export type PlatformRole = "owner" | "user";

export type TeamRole = "admin" | "operator" | "viewer";

export type ProjectAccessRole = "operator" | "viewer";

export type ProjectAccessPath = {
  type: "owner" | "team_admin" | "project_operator" | "project_viewer";
  teamId: string | null;
  teamName: string | null;
  membershipId: string | null;
};

export type LocalUserRecord = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  profileTeam: string | null;
  supabaseUserId: string | null;
  platformRole: PlatformRole;
  isActive: boolean;
  supabaseAccountAvailable: boolean;
  lastSupabaseSyncAt: string | null;
  invitationStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TeamRecord = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TeamMembershipRecord = {
  id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
  isActive: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMembershipRecord = {
  id: string;
  projectId: string;
  teamId: string;
  userId: string;
  accessRole: ProjectAccessRole;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectAccessCapabilities = {
  canViewProject: boolean;
  canViewOverview: boolean;
  canViewDisplays: boolean;
  canOperateDisplays: boolean;
  canUseLocalController: boolean;
  canViewEngines: boolean;
  canOperateEngines: boolean;
  canEditProjectSettings: boolean;
  canViewProjectActivity: boolean;
  canEditScraperCode: boolean;
  canEditDisplayCode: boolean;
  canManageProjectUsers: boolean;
};

export type AuthorizationContext = {
  userId: string;
  email: string;
  displayName: string;
  platformRole: PlatformRole;
  isPlatformOwner: boolean;
  isActive: boolean;
  teamMemberships: Array<{
    teamId: string;
    teamName: string;
    teamIsActive: boolean;
    role: TeamRole;
    isActive: boolean;
  }>;
  accessibleTeamIds: string[];
  accessibleProjectIds: string[];
  canManageUsersAndAccess: boolean;
  canManageTeams: boolean;
};

export const EMPTY_CAPABILITIES: ProjectAccessCapabilities = {
  canViewProject: false,
  canViewOverview: false,
  canViewDisplays: false,
  canOperateDisplays: false,
  canUseLocalController: false,
  canViewEngines: false,
  canOperateEngines: false,
  canEditProjectSettings: false,
  canViewProjectActivity: false,
  canEditScraperCode: false,
  canEditDisplayCode: false,
  canManageProjectUsers: false,
};
