import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccessManagementActions } from "./actions";
import { fetchAccessManagementDirectory } from "./directory-client";
import * as mutations from "./mutations-client";
import {
  createInvitation,
  resendInvitation,
  revokeInvitation,
} from "./invitation-client";

export function createPortalAccessActions(
  supabase: SupabaseClient,
  onDirectoryChange: (directory: Awaited<ReturnType<typeof fetchAccessManagementDirectory>>) => void,
): AccessManagementActions {
  async function refresh() {
    const directory = await fetchAccessManagementDirectory(supabase);
    onDirectoryChange(directory);
    return directory;
  }

  async function afterMutation(
    mutate: () => Promise<Awaited<ReturnType<typeof fetchAccessManagementDirectory>> | void>,
  ) {
    const directory = await mutate();
    if (directory) {
      onDirectoryChange(directory);
    } else {
      await refresh();
    }
  }

  return {
    refresh,
    createTeam: async (input) => {
      await mutations.createTeam(supabase, input);
      await refresh();
    },
    updateTeam: async (input) => {
      await afterMutation(() => mutations.updateTeam(supabase, input));
    },
    archiveTeam: async (teamId) => {
      await afterMutation(() => mutations.archiveTeam(supabase, teamId));
    },
    addTeamMember: async (input) => {
      await afterMutation(() => mutations.addTeamMember(supabase, input));
    },
    changeTeamMemberRole: async (input) => {
      await afterMutation(() => mutations.changeTeamMemberRole(supabase, input));
    },
    removeTeamMember: async (input) => {
      await afterMutation(() => mutations.removeTeamMember(supabase, input));
    },
    assignProjectTeam: async (input) => {
      await afterMutation(() => mutations.assignProjectTeam(supabase, input));
    },
    removeProjectTeam: async (input) => {
      await afterMutation(() => mutations.removeProjectTeam(supabase, input));
    },
    addProjectMember: async (input) => {
      await afterMutation(() => mutations.addProjectMember(supabase, input));
    },
    changeProjectMemberRole: async (input) => {
      await afterMutation(() => mutations.changeProjectMemberRole(supabase, input));
    },
    removeProjectMember: async (input) => {
      await afterMutation(() => mutations.removeProjectMember(supabase, input));
    },
    createInvitation: async (payload) => {
      await createInvitation(payload);
      await refresh();
    },
    resendInvitation: async (invitationId) => {
      await resendInvitation(invitationId);
      await refresh();
    },
    revokeInvitation: async (invitationId) => {
      await revokeInvitation(invitationId);
      await refresh();
    },
  };
}
