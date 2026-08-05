import { localFetch } from "@/lib/local/api";
import type { AccessManagementDirectory } from "@/lib/access-management/types";
import type { CloudProjectRole, CloudTeamRole } from "@/lib/access-management/types";

export async function localGetCloudAccessDirectory(options?: { forceRefresh?: boolean }) {
  const suffix = options?.forceRefresh ? "?forceRefresh=1" : "";
  return localFetch<
    AccessManagementDirectory & {
      ok: boolean;
      offline?: boolean;
      stale?: boolean;
      syncedAt?: string | null;
      warning?: string | null;
      httpStatus?: number;
      fallbackReason?:
        | "offline"
        | "no_session"
        | "cloud_reauthentication_required"
        | "schema_missing"
        | "cloud_config_missing"
        | "session_restoring"
        | "session_refresh_failed_transient"
        | "client_initialization_failed"
        | "directory_rpc_missing"
        | "directory_permission_denied"
        | "directory_request_failed"
        | "directory_parse_failed"
        | "cloud_access_bridge_not_initialized"
        | "connection_refused"
        | "local_api_unreachable"
        | "route_not_found"
        | "malformed_response"
        | "cache_write_failed"
        | "cache_empty"
        | "none"
        | null;
      error?: string | null;
    }
  >(`/api/access/cloud/directory${suffix}`);
}

export async function localGetCloudAccessDirectoryDiagnostics() {
  return localFetch<Record<string, unknown>>("/api/access/cloud/directory/diagnostics");
}

async function localMutate<T>(path: string, init: RequestInit): Promise<T> {
  return localFetch<T>(path, init);
}

export async function localCreateCloudTeam(input: {
  name: string;
  description?: string | null;
}) {
  return localMutate<{ ok: boolean; teamId?: string }>("/api/access/cloud/teams", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function localUpdateCloudTeam(
  teamId: string,
  input: { name?: string; description?: string | null; isActive?: boolean },
) {
  return localMutate<{ ok: boolean }>(`/api/access/cloud/teams/${encodeURIComponent(teamId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function localArchiveCloudTeam(teamId: string) {
  return localMutate<{ ok: boolean }>(
    `/api/access/cloud/teams/${encodeURIComponent(teamId)}/archive`,
    { method: "POST" },
  );
}

export async function localUpsertCloudTeamMember(input: {
  teamId: string;
  userId: string;
  role: CloudTeamRole;
}) {
  return localMutate<{ ok: boolean }>("/api/access/cloud/team-members", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function localRemoveCloudTeamMember(input: { teamId: string; userId: string }) {
  return localMutate<{ ok: boolean }>("/api/access/cloud/team-members", {
    method: "DELETE",
    body: JSON.stringify(input),
  });
}

export async function localCreateCloudInvitation(input: {
  email: string;
  teamId?: string | null;
  teamRole?: string | null;
  platformRole?: string | null;
  projectAssignments?: Array<{ projectId: string; role: string }>;
}) {
  return localMutate<{ ok: boolean }>("/api/access/cloud/invitations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function localRevokeCloudInvitation(invitationId: string) {
  return localMutate<{ ok: boolean }>(
    `/api/access/cloud/invitations/${encodeURIComponent(invitationId)}/revoke`,
    { method: "POST" },
  );
}

export async function localResendCloudInvitation(invitationId: string) {
  return localMutate<{ ok: boolean }>(
    `/api/access/cloud/invitations/${encodeURIComponent(invitationId)}/resend`,
    { method: "POST" },
  );
}

export async function localAssignCloudProjectTeam(input: {
  projectId: string;
  teamId: string;
}) {
  return localMutate<{ ok: boolean }>("/api/access/cloud/project-teams", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function localRemoveCloudProjectTeam(input: {
  projectId: string;
  teamId: string;
}) {
  return localMutate<{ ok: boolean }>("/api/access/cloud/project-teams", {
    method: "DELETE",
    body: JSON.stringify(input),
  });
}

export async function localAssignCloudProjectMember(input: {
  projectId: string;
  userId: string;
  role: CloudProjectRole;
}) {
  return localMutate<{ ok: boolean }>("/api/access/cloud/project-members", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function localRemoveCloudProjectMember(input: {
  projectId: string;
  userId: string;
}) {
  return localMutate<{ ok: boolean }>("/api/access/cloud/project-members", {
    method: "DELETE",
    body: JSON.stringify(input),
  });
}
