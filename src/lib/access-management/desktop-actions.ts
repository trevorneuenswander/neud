import type { AccessManagementActions } from "./actions";
import type { AccessManagementDirectory } from "./types";
import {
  localArchiveCloudTeam,
  localAssignCloudProjectMember,
  localAssignCloudProjectTeam,
  localCreateCloudInvitation,
  localCreateCloudTeam,
  localGetCloudAccessDirectory,
  localRemoveCloudProjectMember,
  localRemoveCloudProjectTeam,
  localRemoveCloudTeamMember,
  localResendCloudInvitation,
  localRevokeCloudInvitation,
  localUpdateCloudTeam,
  localUpsertCloudTeamMember,
} from "@/lib/local/cloud-access-api";

export function createDesktopAccessActions(
  onDirectoryChange: (directory: AccessManagementDirectory) => void,
): AccessManagementActions {
  async function refresh() {
    const directory = await localGetCloudAccessDirectory({ forceRefresh: true });
    if (directory.ok) {
      onDirectoryChange(directory);
    }
    return directory;
  }

  return {
    refresh,
    createTeam: async (input) => {
      await localCreateCloudTeam(input);
      await refresh();
    },
    updateTeam: async (input) => {
      await localUpdateCloudTeam(input.teamId, {
        name: input.name,
        description: input.description,
      });
      await refresh();
    },
    archiveTeam: async (teamId) => {
      await localArchiveCloudTeam(teamId);
      await refresh();
    },
    addTeamMember: async (input) => {
      await localUpsertCloudTeamMember(input);
      await refresh();
    },
    changeTeamMemberRole: async (input) => {
      await localUpsertCloudTeamMember(input);
      await refresh();
    },
    removeTeamMember: async (input) => {
      await localRemoveCloudTeamMember(input);
      await refresh();
    },
    assignProjectTeam: async (input) => {
      await localAssignCloudProjectTeam(input);
      await refresh();
    },
    removeProjectTeam: async (input) => {
      await localRemoveCloudProjectTeam(input);
      await refresh();
    },
    addProjectMember: async (input) => {
      await localAssignCloudProjectMember(input);
      await refresh();
    },
    changeProjectMemberRole: async (input) => {
      await localAssignCloudProjectMember(input);
      await refresh();
    },
    removeProjectMember: async (input) => {
      await localRemoveCloudProjectMember(input);
      await refresh();
    },
    createInvitation: async (payload) => {
      await localCreateCloudInvitation(payload);
      await refresh();
    },
    resendInvitation: async (invitationId) => {
      await localResendCloudInvitation(invitationId);
      await refresh();
    },
    revokeInvitation: async (invitationId) => {
      await localRevokeCloudInvitation(invitationId);
      await refresh();
    },
  };
}
