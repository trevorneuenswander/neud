import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccessManagementDirectory } from "./types";
import { parseAccessManagementError } from "./errors";
import {
  ACCESS_MANAGEMENT_DIRECTORY_RPC_NAME,
  ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS,
} from "./directory-rpc";

export async function fetchAccessManagementDirectory(
  supabase: SupabaseClient,
): Promise<AccessManagementDirectory> {
  const { data, error } = await supabase.rpc(
    ACCESS_MANAGEMENT_DIRECTORY_RPC_NAME,
    ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS,
  );

  if (error) {
    throw parseAccessManagementError(error.message, "forbidden");
  }

  if (!data || typeof data !== "object") {
    throw parseAccessManagementError("invalid_response", "invalid_request");
  }

  const payload = data as AccessManagementDirectory;
  if (!payload.ok) {
    throw parseAccessManagementError(
      (payload as { code?: string }).code ?? "forbidden",
      "forbidden",
    );
  }

  return {
    ok: true,
    teams: payload.teams ?? [],
    teamMemberships: payload.teamMemberships ?? [],
    users: payload.users ?? [],
    projects: payload.projects ?? [],
    projectMembers: payload.projectMembers ?? [],
    projectTeams: payload.projectTeams ?? [],
    invitations: payload.invitations ?? [],
  };
}

export async function createCloudTeam(
  supabase: SupabaseClient,
  input: { name: string; description?: string | null },
): Promise<{ teamId: string }> {
  const { createTeam } = await import("./mutations-client");
  return createTeam(supabase, input);
}
