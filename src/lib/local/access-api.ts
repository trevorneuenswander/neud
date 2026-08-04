import { localFetch } from "@/lib/local/api";
import type {
  AuthorizationContext,
  LocalUserRecord,
  ProjectAccessCapabilities,
  ProjectAccessRole,
  TeamRecord,
  TeamRole,
} from "@/lib/access/types";
import type {
  UserDetailsProfile,
  ViewableUserIdsResponse,
} from "@/lib/users/user-details-types";

export type AccessDirectoryTeam = TeamRecord & {
  userCount: number;
  adminCount: number;
  projectCount: number;
};

export type AccessDirectoryUser = LocalUserRecord & {
  teamMemberships: Array<{
    id: string;
    teamId: string;
    userId: string;
    role: TeamRole;
    isActive: boolean;
  }>;
  projectAssignmentCount: number;
  assignedProjectNames: string[];
};

export type AccessDirectoryProject = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  teamIds: string[];
  teams: Array<{ id: string; name: string }>;
  isActive: boolean;
  operators: string[];
  viewers: string[];
};

export type AccessDirectoryInvitation = {
  id: string;
  email: string;
  fullName: string;
  teamId: string;
  teamRole: TeamRole;
  projectIds: string[];
  status: string;
};

export type AccessDirectory = {
  context: AuthorizationContext;
  teams: AccessDirectoryTeam[];
  users: AccessDirectoryUser[];
  projects: AccessDirectoryProject[];
  invitations: AccessDirectoryInvitation[];
};

export type ProjectAccessContextResponse = {
  project: Record<string, unknown>;
  capabilities: ProjectAccessCapabilities;
  projectRole: string;
  isPlatformAdmin: boolean;
  canManageSettings: boolean;
  canManageMembers: boolean;
};

export async function localGetAccessDirectory() {
  return localFetch<AccessDirectory>("/api/access/directory");
}

export async function localCreateTeam(input: {
  name: string;
  description?: string | null;
}) {
  return localFetch<{ team: TeamRecord }>("/api/access/teams", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function localUpdateTeam(
  teamId: string,
  input: { name?: string; description?: string | null; isActive?: boolean },
) {
  return localFetch<{ team: TeamRecord }>(
    `/api/access/teams/${encodeURIComponent(teamId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function localInviteAccessUser(input: {
  email: string;
  fullName: string;
  teamId: string;
  role: TeamRole;
  projectIds?: string[];
}) {
  return localFetch<{ ok?: boolean }>("/api/access/invite", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function localUpsertAccessTeamMember(input: {
  teamId: string;
  userId: string;
  role: TeamRole;
  projectIds?: string[];
}) {
  return localFetch<{ membership: unknown }>("/api/access/team-members", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function localAssignAccessProject(input: {
  projectId: string;
  teamId: string;
  userId: string;
  accessRole: ProjectAccessRole;
}) {
  return localFetch<{ ok: boolean }>("/api/access/project-assignments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function localRemoveAccessProjectAssignment(input: {
  projectId: string;
  teamId: string;
  userId: string;
}) {
  return localFetch<{ ok: boolean }>("/api/access/project-assignments", {
    method: "DELETE",
    body: JSON.stringify(input),
  });
}

export async function localSetProjectTeams(input: {
  projectId: string;
  teamIds: string[];
}) {
  return localFetch<{ projectId: string; teamIds: string[] }>(
    "/api/access/projects/teams",
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
}

export async function localAssignProjectTeam(input: {
  projectId: string;
  teamId: string;
  removeAssignments?: boolean;
}) {
  return localFetch<{ project: unknown }>("/api/access/projects/team", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function localSetAccessUserActive(userId: string, isActive: boolean) {
  return localFetch<{ user: LocalUserRecord }>(
    `/api/access/users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    },
  );
}

export async function localGetProjectAccessUsers(projectSlug: string) {
  return localFetch<{
    users: Array<{
      id: string;
      name: string;
      email: string | null;
      role: string;
      paths?: Array<{
        type: "owner" | "team_admin" | "project_operator" | "project_viewer";
        teamId: string | null;
        teamName: string | null;
        membershipId: string | null;
      }>;
      removablePaths?: Array<{
        type: "owner" | "team_admin" | "project_operator" | "project_viewer";
        teamId: string | null;
        teamName: string | null;
        membershipId: string | null;
      }>;
    }>;
  }>(`/api/projects/${encodeURIComponent(projectSlug)}/access-users`);
}

export async function localRemoveProjectAccess(input: {
  projectSlug: string;
  userId: string;
  teamId: string;
  pathType: "project_operator" | "project_viewer" | "team_admin";
}) {
  return localFetch<{ ok: boolean }>(
    `/api/projects/${encodeURIComponent(input.projectSlug)}/access-users`,
    {
      method: "POST",
      body: JSON.stringify({
        userId: input.userId,
        teamId: input.teamId,
        pathType: input.pathType,
      }),
    },
  );
}

export async function localGetProjectAccessContext(projectSlug: string) {
  return localFetch<ProjectAccessContextResponse>(
    `/api/projects/${encodeURIComponent(projectSlug)}/access`,
  );
}

export async function localGetViewableUserIds() {
  return localFetch<ViewableUserIdsResponse>("/api/access/viewable-user-ids");
}

export type UserDetailsApiResponse = {
  user: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    teamName: string | null;
    roleLabel: string;
    platformRole: UserDetailsProfile["platformRole"];
    source: UserDetailsProfile["source"];
    isActive: boolean;
    supabaseUserId?: string | null;
    supabaseAccountAvailable?: boolean;
    lastSupabaseSyncAt?: string | null;
  };
  teams: UserDetailsProfile["teams"];
  projects: UserDetailsProfile["projects"];
};

export async function localGetUserDetails(userId: string) {
  return localFetch<UserDetailsApiResponse>(
    `/api/access/users/${encodeURIComponent(userId)}`,
  );
}
