export const TRUSTED_ACCESS_DIAGNOSTICS_KEY = "trustedAccess.diagnostics";

export type TrustedAccessFailureStage =
  | "desktop_shared_auth_unavailable"
  | "desktop_access_token_missing"
  | "local_api_auth_header_missing"
  | "trusted_client_token_missing"
  | "hosted_auth_header_missing"
  | "hosted_bearer_parse_failed"
  | "hosted_get_user_failed"
  | "hosted_caller_unresolved"
  | "probe_route_mismatch"
  | "trusted_route_version_mismatch"
  | "probe_response_invalid"
  | "probe_response_parse_failed"
  | "caller_permission_denied"
  | "bearer_token_not_attached"
  | "stale_access_token_attached"
  | "trusted_route_missing_authorization"
  | "trusted_route_session_parse_failed"
  | "trusted_route_user_lookup_failed"
  | "route_treats_desktop_as_browser_cookie_session"
  | "permission_check_failed"
  | "invite_rpc_failed"
  | "auth_admin_invite_failed"
  | "invitation_service_unavailable"
  | "network_unreachable"
  | "none";

export type TrustedAccessDiagnostics = {
  trustedAccessRequestAttempted: boolean;
  trustedAccessTokenPresent: boolean;
  trustedAccessTokenExpired: boolean;
  trustedAccessAuthorizationHeaderAttached: boolean;
  trustedAccessRoute: string | null;
  trustedAccessHttpStatus: number | null;
  trustedAccessResponseCode: string | null;
  trustedAccessSafeMessage: string | null;
  firstInvitationFailureStage: TrustedAccessFailureStage;
  authAdminInviteConfigured?: boolean | null;
  authAdminInviteLastAttempted?: boolean | null;
  authAdminInviteLastSucceeded?: boolean | null;
  authAdminInviteHttpStatus?: number | null;
  authAdminInviteErrorCode?: string | null;
  authAdminInviteErrorCategory?: string | null;
  authAdminInviteRedirectCategory?: string | null;
  authAdminInviteRedirectTo?: string | null;
  targetUserAlreadyExists?: boolean | null;
  firstInvitationEmailFailureStage?: string | null;
  invitationRevokedAfterFailure?: boolean | null;
  updatedAt: string;
};

export function createDefaultTrustedAccessDiagnostics(
  overrides: Partial<TrustedAccessDiagnostics> = {},
): TrustedAccessDiagnostics {
  return {
    trustedAccessRequestAttempted: false,
    trustedAccessTokenPresent: false,
    trustedAccessTokenExpired: false,
    trustedAccessAuthorizationHeaderAttached: false,
    trustedAccessRoute: null,
    trustedAccessHttpStatus: null,
    trustedAccessResponseCode: null,
    trustedAccessSafeMessage: null,
    firstInvitationFailureStage: "none",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
