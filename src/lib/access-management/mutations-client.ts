import type { SupabaseClient } from "@supabase/supabase-js";
import type { CloudProjectRole, CloudTeamRole } from "./types";
import { invokeAccessRpc } from "./rpc";
import { fetchAccessManagementDirectory } from "./directory-client";

async function mutateAndRefresh(
  supabase: SupabaseClient,
  rpcName: string,
  params: Record<string, unknown>,
) {
  await invokeAccessRpc(supabase, rpcName, params);
  return fetchAccessManagementDirectory(supabase);
}

export async function createTeam(
  supabase: SupabaseClient,
  input: { name: string; description?: string | null },
) {
  const payload = await invokeAccessRpc(supabase, "create_team", {
    p_name: input.name,
    p_description: null,
  });
  return { teamId: String(payload.team_id ?? "") };
}

export async function updateTeam(
  supabase: SupabaseClient,
  input: {
    teamId: string;
    name?: string;
    description?: string | null;
    isActive?: boolean;
  },
) {
  return mutateAndRefresh(supabase, "update_team", {
    p_team_id: input.teamId,
    p_name: input.name ?? null,
    p_description: input.description ?? null,
    p_is_active: input.isActive ?? null,
  });
}

export async function archiveTeam(supabase: SupabaseClient, teamId: string) {
  return mutateAndRefresh(supabase, "archive_team", { p_team_id: teamId });
}

export async function addTeamMember(
  supabase: SupabaseClient,
  input: { teamId: string; userId: string; role: CloudTeamRole },
) {
  return mutateAndRefresh(supabase, "upsert_team_member", {
    p_team_id: input.teamId,
    p_user_id: input.userId,
    p_role: input.role,
  });
}

export async function changeTeamMemberRole(
  supabase: SupabaseClient,
  input: { teamId: string; userId: string; role: CloudTeamRole },
) {
  return addTeamMember(supabase, input);
}

export async function removeTeamMember(
  supabase: SupabaseClient,
  input: { teamId: string; userId: string },
) {
  return mutateAndRefresh(supabase, "remove_team_member", {
    p_team_id: input.teamId,
    p_user_id: input.userId,
  });
}

export async function assignProjectTeam(
  supabase: SupabaseClient,
  input: { projectId: string; teamId: string },
) {
  return mutateAndRefresh(supabase, "assign_project_team", {
    p_project_id: input.projectId,
    p_team_id: input.teamId,
  });
}

export async function removeProjectTeam(
  supabase: SupabaseClient,
  input: { projectId: string; teamId: string },
) {
  return mutateAndRefresh(supabase, "remove_project_team", {
    p_project_id: input.projectId,
    p_team_id: input.teamId,
  });
}

export async function addProjectMember(
  supabase: SupabaseClient,
  input: { projectId: string; userId: string; role: CloudProjectRole },
) {
  return mutateAndRefresh(supabase, "upsert_project_member", {
    p_project_id: input.projectId,
    p_user_id: input.userId,
    p_role: input.role,
  });
}

export async function changeProjectMemberRole(
  supabase: SupabaseClient,
  input: { projectId: string; userId: string; role: CloudProjectRole },
) {
  return addProjectMember(supabase, input);
}

export async function removeProjectMember(
  supabase: SupabaseClient,
  input: { projectId: string; userId: string },
) {
  return mutateAndRefresh(supabase, "remove_project_member", {
    p_project_id: input.projectId,
    p_user_id: input.userId,
  });
}

// Backward-compatible aliases
export { createTeam as createCloudTeam };
