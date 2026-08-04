import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedCloudCoordinator } from "./authenticated-cloud-coordinator";
import { logCloudAccessLifecycle } from "./authenticated-client-provider";
import {
  createEmptyCloudAccessBridgeDiagnostics,
  type CloudAccessBridgeDiagnostics,
} from "./cloud-access-bridge-diagnostics";
import {
  CloudAccessDirectoryError,
  classifyCloudAccessDirectoryFailure,
  parseCloudAccessDirectoryResponse,
  type ParsedCloudAccessDirectory,
} from "./cloud-access-directory";
import {
  buildDirectoryRpcDiagnosticsFromError,
  buildDirectoryRpcDiagnosticsFromPayload,
  createEmptyDirectoryRpcDiagnostics,
  directoryRpcCategoryToCloudAccessError,
  ACCESS_MANAGEMENT_DIRECTORY_RPC_NAME,
  ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS,
  type DirectoryRpcDiagnostics,
} from "./cloud-access-directory-rpc";

function mapSessionStateToDirectoryError(
  sessionState: string,
  errorCode: string | null,
): CloudAccessDirectoryError {
  switch (sessionState) {
    case "cloud_config_missing":
      return new CloudAccessDirectoryError(
        "cloud_config_missing",
        "Cloud access is not configured.",
      );
    case "no_persisted_session":
      return new CloudAccessDirectoryError(
        "no_session",
        "Access management requires an authenticated cloud session.",
      );
    case "session_restoring":
      return new CloudAccessDirectoryError(
        "session_restoring",
        "Restoring cloud access…",
      );
    case "invalid_refresh_token":
      return new CloudAccessDirectoryError(
        "cloud_reauthentication_required",
        "Your cloud session has expired. Sign in again to resume publishing and access management.",
      );
    case "session_refresh_failed_transient":
      return new CloudAccessDirectoryError(
        "session_refresh_failed_transient",
        "Cloud access could not be restored. Retry.",
      );
    case "authenticated_client_initialization_failed":
      return new CloudAccessDirectoryError(
        "client_initialization_failed",
        "Cloud access could not be restored. Retry.",
      );
    default:
      return new CloudAccessDirectoryError(
        "directory_request_failed",
        errorCode === "token_refresh_failed"
          ? "Cloud access could not be restored. Retry."
          : "Access management data could not be loaded.",
      );
  }
}

export class CloudAccessBridge {
  private directoryRequestInFlight: Promise<ParsedCloudAccessDirectory> | null = null;
  private readonly bridgeDiagnostics = createEmptyCloudAccessBridgeDiagnostics();
  private readonly bridgeInstanceId: string;

  constructor(private readonly cloud: AuthenticatedCloudCoordinator) {
    this.bridgeInstanceId = cloud.instanceIdHash;
    this.bridgeDiagnostics.cloudAccessBridgeInstanceInitialized = true;
    this.bridgeDiagnostics.bridgeUsesSharedSessionService = true;
    this.bridgeDiagnostics.sessionServiceInstanceIdHash = cloud.getInstanceIdHash();
    logCloudAccessLifecycle("bridge_constructed", {
      bridgeInstanceId: this.bridgeInstanceId,
      sharedSessionService: true,
    });
  }

  getBridgeDiagnostics(): CloudAccessBridgeDiagnostics {
    return {
      ...this.bridgeDiagnostics,
      persistedTokensPresent: this.cloud.hasRestorableSession(),
      sessionServiceInstanceIdHash: this.cloud.getInstanceIdHash(),
      bridgeUsesSharedSessionService: true,
      cloudAccessBridgeInstanceInitialized: true,
    };
  }

  private async requireClient(options?: {
    forceRefresh?: boolean;
    reason?: string;
  }): Promise<SupabaseClient> {
    this.bridgeDiagnostics.authenticatedClientCreationAttempted = true;
    this.bridgeDiagnostics.persistedTokensPresent = this.cloud.hasRestorableSession();

    const acquisition = await this.cloud.acquireAuthenticatedClient(
      options?.reason ?? "cloud_access_directory",
      { forceRefresh: options?.forceRefresh },
    );

    this.bridgeDiagnostics.sessionRefreshAttempted = acquisition.sessionRefreshAttempted;
    this.bridgeDiagnostics.sessionRefreshResult = acquisition.sessionRefreshResult;
    this.bridgeDiagnostics.authenticatedClientCreationResult = acquisition.client
      ? "success"
      : "failure";
    this.bridgeDiagnostics.authenticatedClientCreationErrorCode = acquisition.errorCode;

    if (acquisition.client) {
      return acquisition.client;
    }

    throw mapSessionStateToDirectoryError(acquisition.sessionState, acquisition.errorCode);
  }

  async getDirectory(options?: { forceRefresh?: boolean }): Promise<ParsedCloudAccessDirectory> {
    if (this.directoryRequestInFlight && !options?.forceRefresh) {
      return this.directoryRequestInFlight;
    }

    const request = this.getDirectoryInternal(options).finally(() => {
      if (this.directoryRequestInFlight === request) {
        this.directoryRequestInFlight = null;
      }
    });
    this.directoryRequestInFlight = request;
    return request;
  }

  private mergeDirectoryRpcDiagnostics(partial: DirectoryRpcDiagnostics) {
    Object.assign(this.bridgeDiagnostics, partial);
  }

  private async populateCallerRpcContext(
    client: SupabaseClient,
    base: DirectoryRpcDiagnostics,
  ): Promise<DirectoryRpcDiagnostics> {
    const { data: userData } = await client.auth.getUser();
    const uid = userData.user?.id ?? null;
    if (!uid) {
      return {
        ...base,
        directoryRpcCallerUidPresent: false,
        directoryRpcCallerAuthorized: false,
      };
    }

    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("id", uid)
      .maybeSingle();
    const { count } = await client
      .from("team_memberships")
      .select("*", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("status", "active");

    const role = typeof profile?.role === "string" ? profile.role : null;
    const isPlatformAuthorized = role === "owner" || role === "admin";
    const hasTeamAdminScope = (count ?? 0) > 0;

    return {
      ...base,
      directoryRpcCallerUidPresent: true,
      directoryRpcCallerPlatformRole: role,
      directoryRpcCallerTeamMembershipCount: count ?? 0,
      directoryRpcCallerAuthorized: isPlatformAuthorized || hasTeamAdminScope,
    };
  }

  private async getDirectoryInternal(options?: {
    forceRefresh?: boolean;
  }): Promise<ParsedCloudAccessDirectory> {
    this.bridgeDiagnostics.directoryRpcAttempted = false;
    this.bridgeDiagnostics.firstCloudAccessFailureStage = "none";
    this.mergeDirectoryRpcDiagnostics(createEmptyDirectoryRpcDiagnostics());

    const client = await this.requireClient({
      reason: options?.forceRefresh ? "getDirectory:forceRefresh" : "getDirectory",
    });

    const callerContext = await this.populateCallerRpcContext(
      client,
      createEmptyDirectoryRpcDiagnostics(),
    );
    this.mergeDirectoryRpcDiagnostics(callerContext);

    this.bridgeDiagnostics.directoryRpcAttempted = true;
    logCloudAccessLifecycle("directory_rpc_attempt", {
      forceRefresh: Boolean(options?.forceRefresh),
      callerAuthorized: callerContext.directoryRpcCallerAuthorized,
      callerPlatformRole: callerContext.directoryRpcCallerPlatformRole,
    });

    const { data, error } = await client.rpc(
      ACCESS_MANAGEMENT_DIRECTORY_RPC_NAME,
      ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS,
    );

    if (error) {
      this.mergeDirectoryRpcDiagnostics(
        buildDirectoryRpcDiagnosticsFromError(error, callerContext),
      );
      this.bridgeDiagnostics.firstCloudAccessFailureStage = "directory_rpc_failed";
      const rpcError = directoryRpcCategoryToCloudAccessError(
        this.bridgeDiagnostics.directoryRpcSafeCategory,
      );
      throw classifyCloudAccessDirectoryFailure(rpcError, this.cloud.hasCloudSession());
    }

    this.mergeDirectoryRpcDiagnostics(
      buildDirectoryRpcDiagnosticsFromPayload(data, callerContext),
    );

    try {
      const parsed = parseCloudAccessDirectoryResponse(data);
      this.bridgeDiagnostics.firstCloudAccessFailureStage = "none";
      return parsed;
    } catch (parseError) {
      this.bridgeDiagnostics.firstCloudAccessFailureStage = "directory_parse_failed";
      this.mergeDirectoryRpcDiagnostics({
        ...callerContext,
        directoryRpcSafeCategory: "response_contract_mismatch",
        directoryRpcFailureSection: "result_parsing",
        directoryRpcSafeMessage: "Directory response failed parser contract.",
      });
      throw classifyCloudAccessDirectoryFailure(parseError, this.cloud.hasCloudSession());
    }
  }

  async createTeam(input: { name: string; description?: string | null }) {
    return this.invokeRpc("create_team", {
      p_name: input.name,
      p_description: input.description ?? null,
    });
  }

  async updateTeam(input: {
    teamId: string;
    name?: string;
    description?: string | null;
    isActive?: boolean;
  }) {
    return this.invokeRpc("update_team", {
      p_team_id: input.teamId,
      p_name: input.name ?? null,
      p_description: input.description ?? null,
      p_is_active: input.isActive ?? null,
    });
  }

  async archiveTeam(teamId: string) {
    return this.invokeRpc("archive_team", { p_team_id: teamId });
  }

  async upsertTeamMember(input: {
    teamId: string;
    userId: string;
    role: string;
  }) {
    return this.invokeRpc("upsert_team_member", {
      p_team_id: input.teamId,
      p_user_id: input.userId,
      p_role: input.role,
    });
  }

  async removeTeamMember(input: { teamId: string; userId: string }) {
    return this.invokeRpc("remove_team_member", {
      p_team_id: input.teamId,
      p_user_id: input.userId,
    });
  }

  async assignProjectTeam(input: { projectId: string; teamId: string }) {
    return this.invokeRpc("assign_project_team", {
      p_project_id: input.projectId,
      p_team_id: input.teamId,
    });
  }

  async removeProjectTeam(input: { projectId: string; teamId: string }) {
    return this.invokeRpc("remove_project_team", {
      p_project_id: input.projectId,
      p_team_id: input.teamId,
    });
  }

  async upsertProjectMember(input: {
    projectId: string;
    userId: string;
    role: string;
  }) {
    return this.invokeRpc("upsert_project_member", {
      p_project_id: input.projectId,
      p_user_id: input.userId,
      p_role: input.role,
    });
  }

  async removeProjectMember(input: { projectId: string; userId: string }) {
    return this.invokeRpc("remove_project_member", {
      p_project_id: input.projectId,
      p_user_id: input.userId,
    });
  }

  async createInvitationRecord(input: {
    email: string;
    teamId?: string | null;
    teamRole?: string | null;
    platformRole?: string | null;
    tokenHash: string;
    expiresAt: string;
    projectAssignments?: unknown;
  }) {
    return this.invokeRpc("create_cloud_invitation", {
      p_email: input.email,
      p_team_id: input.teamId ?? null,
      p_team_role: input.teamRole ?? null,
      p_platform_role: input.platformRole ?? null,
      p_token_hash: input.tokenHash,
      p_expires_at: input.expiresAt,
      p_project_assignments: input.projectAssignments ?? [],
    });
  }

  async revokeInvitation(invitationId: string) {
    return this.invokeRpc("revoke_cloud_invitation", {
      p_invitation_id: invitationId,
    });
  }

  async resendInvitation(input: {
    invitationId: string;
    tokenHash: string;
    expiresAt: string;
  }) {
    return this.invokeRpc("resend_cloud_invitation", {
      p_invitation_id: input.invitationId,
      p_token_hash: input.tokenHash,
      p_expires_at: input.expiresAt,
    });
  }

  async invokeRpc(name: string, params: Record<string, unknown>) {
    const client = await this.requireClient({ reason: `rpc:${name}` });
    const { data, error } = await client.rpc(name, params);
    if (error) {
      throw new Error(error.message);
    }
    if (!data || typeof data !== "object" || !(data as { ok?: boolean }).ok) {
      const code = (data as { code?: string; message?: string } | null)?.message;
      throw new Error(code ?? "Cloud access request was rejected.");
    }
    return data;
  }
}
