import type {
  AccessManagementDirectory,
  CloudProjectRole,
  CloudTeamRole,
} from "./types";
import type { InvitationRequestPayload } from "./invitation-client";

export type AccessManagementActions = {
  refresh: () => Promise<AccessManagementDirectory | void>;
  createTeam: (input: { name: string; description?: string | null }) => Promise<void>;
  updateTeam: (input: {
    teamId: string;
    name?: string;
    description?: string | null;
  }) => Promise<void>;
  archiveTeam: (teamId: string) => Promise<void>;
  addTeamMember: (input: {
    teamId: string;
    userId: string;
    role: CloudTeamRole;
  }) => Promise<void>;
  changeTeamMemberRole: (input: {
    teamId: string;
    userId: string;
    role: CloudTeamRole;
  }) => Promise<void>;
  removeTeamMember: (input: { teamId: string; userId: string }) => Promise<void>;
  assignProjectTeam: (input: { projectId: string; teamId: string }) => Promise<void>;
  removeProjectTeam: (input: { projectId: string; teamId: string }) => Promise<void>;
  addProjectMember: (input: {
    projectId: string;
    userId: string;
    role: CloudProjectRole;
  }) => Promise<void>;
  changeProjectMemberRole: (input: {
    projectId: string;
    userId: string;
    role: CloudProjectRole;
  }) => Promise<void>;
  removeProjectMember: (input: { projectId: string; userId: string }) => Promise<void>;
  createInvitation: (payload: InvitationRequestPayload) => Promise<void>;
  resendInvitation: (invitationId: string) => Promise<void>;
  revokeInvitation: (invitationId: string) => Promise<void>;
};

export const EMPTY_ACCESS_DIRECTORY: AccessManagementDirectory = {
  ok: true,
  teams: [],
  teamMemberships: [],
  users: [],
  projects: [],
  projectMembers: [],
  projectTeams: [],
  invitations: [],
};
