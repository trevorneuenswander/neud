import type { AuthenticatedCloudCoordinator } from "./authenticated-cloud-coordinator";
import {
  parseAccessInvitationProbeBody,
  type AccessInvitationProbeResult,
} from "./access-invitation-probe";
import {
  ACCESS_INVITATION_CREATE_ROUTE,
  ACCESS_INVITATION_PROBE_ROUTE,
  buildAccessUserDeleteRoute,
  buildAccessTeamDeleteRoute,
} from "./trusted-access-routes";
import {
  classifyTrustedPortalOriginCategory,
  trustedPortalOriginHost,
} from "./trusted-portal-origin";
import {
  createDefaultTrustedAccessDiagnostics,
  TRUSTED_ACCESS_DIAGNOSTICS_KEY,
  type TrustedAccessDiagnostics,
  type TrustedAccessFailureStage,
} from "./trusted-access-diagnostics";
import type { AppSettingsRepository } from "../repositories/app-settings-repository";

const INVITE_ERROR_MESSAGES: Record<string, string> = {
  authentication_required: "Sign in to manage access.",
  insufficient_access: "You do not have permission to invite users to this team.",
  duplicate_invitation: "A pending invitation already exists for this email.",
  invalid_request: "Check the email address and invitation settings.",
  invitation_service_unavailable: "The invitation service is temporarily unavailable.",
  invitation_redirect_not_allowed: "Invitation link configuration needs attention.",
  invalid_email: "Enter a valid email address.",
  user_already_exists: "This email already has an account.",
  email_rate_limited: "Too many invitation emails were sent. Try again later.",
  smtp_failure: "The invitation email service is unavailable.",
  auth_provider_failure: "The invitation email service is unavailable.",
  auth_admin_invite_failed: "The invitation email could not be sent.",
  owner_role_not_assignable: "Owner is reserved for the sole NEUD owner account.",
  invalid_team_role: "Team role must be Admin or Member.",
  forbidden: "You do not have permission to perform this action.",
};

export class TrustedAccessRequestError extends Error {
  readonly code: string;
  readonly httpStatus: number | null;

  constructor(message: string, code: string, httpStatus: number | null = null) {
    super(message);
    this.name = "TrustedAccessRequestError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export class DesktopTrustedAccessApiClient {
  constructor(
    private readonly trustedPortalOrigin: string,
    private readonly cloud: AuthenticatedCloudCoordinator,
    private readonly settings?: AppSettingsRepository,
  ) {}

  getDiagnostics(): TrustedAccessDiagnostics {
    return (
      this.settings?.get<TrustedAccessDiagnostics | null>(
        TRUSTED_ACCESS_DIAGNOSTICS_KEY,
        null,
      ) ?? createDefaultTrustedAccessDiagnostics()
    );
  }

  private persistDiagnostics(patch: Partial<TrustedAccessDiagnostics>): void {
    if (!this.settings) {
      return;
    }
    const next = {
      ...this.getDiagnostics(),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.settings.set(TRUSTED_ACCESS_DIAGNOSTICS_KEY, next);
  }

  private resolveFailureStage(input: {
    tokenPresent: boolean;
    tokenExpired: boolean;
    httpStatus: number | null;
    responseCode: string | null;
    networkError: boolean;
  }): TrustedAccessFailureStage {
    if (input.networkError) {
      return "network_unreachable";
    }
    if (!this.cloud.isAuthenticatedCloudSessionAvailable()) {
      return "desktop_shared_auth_unavailable";
    }
    if (!input.tokenPresent) {
      return input.responseCode === "probe_response_invalid"
        ? "probe_response_invalid"
        : "desktop_access_token_missing";
    }
    if (input.tokenExpired) {
      return "stale_access_token_attached";
    }
    if (input.httpStatus === 401 || input.responseCode === "authentication_required") {
      return input.responseCode === "hosted_get_user_failed"
        ? "hosted_get_user_failed"
        : input.responseCode === "trusted_route_version_mismatch"
          ? "trusted_route_version_mismatch"
          : "hosted_get_user_failed";
    }
    if (input.httpStatus === 403) {
      return "permission_check_failed";
    }
    if (input.responseCode === "invitation_service_unavailable") {
      return "invitation_service_unavailable";
    }
    if (
      input.responseCode === "auth_admin_invite_failed" ||
      input.responseCode === "invitation_redirect_not_allowed" ||
      input.responseCode === "user_already_exists" ||
      input.responseCode === "smtp_failure" ||
      input.responseCode === "email_rate_limited"
    ) {
      return "auth_admin_invite_failed";
    }
    if (input.responseCode && input.responseCode !== "ok") {
      return "invite_rpc_failed";
    }
    return "none";
  }

  private async getAccessToken(forceRefresh = false): Promise<string> {
    const tokenResult = await this.cloud.getCloudAccessToken(
      forceRefresh ? { forceRefresh: true } : undefined,
    );

    this.persistDiagnostics({
      trustedAccessTokenPresent: Boolean(tokenResult.accessToken),
      trustedAccessTokenExpired: tokenResult.expired,
    });

    if (!tokenResult.accessToken) {
      const stage = this.resolveFailureStage({
        tokenPresent: false,
        tokenExpired: tokenResult.expired,
        httpStatus: null,
        responseCode: tokenResult.errorCode,
        networkError: false,
      });
      this.persistDiagnostics({
        firstInvitationFailureStage: stage,
        trustedAccessSafeMessage: INVITE_ERROR_MESSAGES.authentication_required,
        trustedAccessResponseCode: tokenResult.errorCode ?? "authentication_required",
      });
      throw new TrustedAccessRequestError(
        INVITE_ERROR_MESSAGES.authentication_required,
        "authentication_required",
      );
    }

    if (tokenResult.expired) {
      const refreshed = await this.cloud.getCloudAccessToken({ forceRefresh: true });
      if (!refreshed.accessToken) {
        this.persistDiagnostics({
          firstInvitationFailureStage: "stale_access_token_attached",
          trustedAccessResponseCode: refreshed.errorCode ?? "authentication_required",
        });
        throw new TrustedAccessRequestError(
          INVITE_ERROR_MESSAGES.authentication_required,
          "authentication_required",
        );
      }
      return refreshed.accessToken;
    }

    return tokenResult.accessToken;
  }

  getTrustedPortalOriginDiagnostics() {
    return {
      trustedPortalOriginHost: trustedPortalOriginHost(this.trustedPortalOrigin),
      trustedPortalOriginCategory: classifyTrustedPortalOriginCategory(
        this.trustedPortalOrigin,
      ),
    };
  }

  async probeTrustedAccessAuth(): Promise<
    TrustedAccessDiagnostics &
      AccessInvitationProbeResult &
      Record<string, unknown>
  > {
    const route = ACCESS_INVITATION_PROBE_ROUTE;
    this.persistDiagnostics({
      trustedAccessRequestAttempted: true,
      trustedAccessRoute: route,
    });

    let token: string;
    try {
      token = await this.getAccessToken(false);
    } catch {
      const diagnostics = this.getDiagnostics();
      const parsed = parseAccessInvitationProbeBody({}, { httpStatus: null });
      return {
        ...diagnostics,
        ...parsed,
        trustedClientTokenPresent: false,
        hostedRequestAuthorizationAttached: false,
      };
    }

    this.persistDiagnostics({
      trustedAccessTokenPresent: true,
      trustedAccessAuthorizationHeaderAttached: true,
    });

    let response: Response;
    try {
      response = await fetch(`${this.trustedPortalOrigin}${route}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "network_error";
      const networkError = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network/i.test(
        message,
      );
      const stage: TrustedAccessFailureStage = networkError
        ? "network_unreachable"
        : "network_unreachable";
      this.persistDiagnostics({
        trustedAccessHttpStatus: null,
        firstInvitationFailureStage: stage,
        trustedAccessSafeMessage: "Unable to reach the invitation service.",
      });
      const parsed = parseAccessInvitationProbeBody({}, { httpStatus: null });
      return {
        ...this.getDiagnostics(),
        ...parsed,
        firstInvitationFailureStage: stage,
        trustedClientTokenPresent: true,
        hostedRequestAuthorizationAttached: false,
      };
    }

    let jsonParseFailed = false;
    const rawBody = await response.json().catch(() => {
      jsonParseFailed = true;
      return {};
    });
    const parsed = parseAccessInvitationProbeBody(rawBody, {
      httpStatus: response.status,
      jsonParseFailed,
      requireRouteMarker: true,
    });

    const failureStage = parsed.trustedAccessCallerResolved
      ? ("none" as TrustedAccessFailureStage)
      : (parsed.firstInvitationFailureStage as TrustedAccessFailureStage);

    const versionSkewStages = new Set([
      "trusted_route_version_mismatch",
      "probe_route_mismatch",
      "probe_response_invalid",
      "probe_response_parse_failed",
    ]);

    this.persistDiagnostics({
      trustedAccessHttpStatus: response.status,
      trustedAccessResponseCode: parsed.ok ? "ok" : parsed.firstInvitationFailureStage,
      trustedAccessAuthorizationHeaderAttached: true,
      trustedAccessRoute: route,
      firstInvitationFailureStage: failureStage,
      trustedAccessSafeMessage: parsed.trustedAccessCallerResolved
        ? null
        : versionSkewStages.has(parsed.firstInvitationFailureStage)
          ? "Hosted invitation API version does not match this desktop build."
          : INVITE_ERROR_MESSAGES.authentication_required,
    });

    return {
      ...this.getDiagnostics(),
      ...parsed,
      trustedAccessRoute: route,
      trustedClientTokenPresent: true,
      hostedRequestAuthorizationAttached: true,
      ...this.getTrustedPortalOriginDiagnostics(),
    };
  }

  private async request(
    path: string,
    method: "GET" | "POST",
    body?: Record<string, unknown>,
    attempt = 0,
  ): Promise<Record<string, unknown>> {
    const token = await this.getAccessToken(attempt > 0);
    this.persistDiagnostics({
      trustedAccessRequestAttempted: true,
      trustedAccessRoute: path,
      trustedAccessAuthorizationHeaderAttached: true,
    });

    let response: Response;
    try {
      response = await fetch(`${this.trustedPortalOrigin}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "network_error";
      const networkError = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network/i.test(
        message,
      );
      const stage = this.resolveFailureStage({
        tokenPresent: true,
        tokenExpired: false,
        httpStatus: null,
        responseCode: null,
        networkError,
      });
      this.persistDiagnostics({
        trustedAccessHttpStatus: null,
        firstInvitationFailureStage: stage,
        trustedAccessSafeMessage: networkError
          ? "Unable to reach the invitation service."
          : "Unable to reach the access management service. Try again.",
      });
      throw new TrustedAccessRequestError(
        networkError
          ? "Unable to reach the invitation service."
          : "Unable to reach the access management service. Try again.",
        networkError ? "network_error" : "request_failed",
      );
    }

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      code?: string;
      message?: string;
      route?: string;
      postGetUserAttempted?: boolean;
      postGetUserSucceeded?: boolean;
      authAdminInviteConfigured?: boolean | null;
      authAdminInviteAttempted?: boolean;
      authAdminInviteSucceeded?: boolean;
      authAdminInviteHttpStatus?: number | null;
      authAdminInviteErrorCode?: string | null;
      authAdminInviteErrorCategory?: string | null;
      authAdminInviteRedirectCategory?: string | null;
      authAdminInviteRedirectTo?: string | null;
      firstInvitationEmailFailureStage?: string | null;
      targetUserAlreadyExists?: boolean | null;
      invitationRevokedAfterFailure?: boolean | null;
    };

    this.persistDiagnostics({
      trustedAccessHttpStatus: response.status,
      trustedAccessResponseCode: payload.code ?? (response.ok ? "ok" : "unknown"),
    });

    if (response.status === 401 && attempt === 0) {
      return this.request(path, method, body, attempt + 1);
    }

    if (!response.ok || payload.ok === false) {
      const code = payload.code ?? (response.status === 401 ? "authentication_required" : "forbidden");
      let responseCodeForStage = code;
      if (response.status === 404) {
        responseCodeForStage = "trusted_route_version_mismatch";
      } else if (
        payload.postGetUserAttempted === true &&
        payload.postGetUserSucceeded !== true
      ) {
        responseCodeForStage = "hosted_get_user_failed";
      } else if (response.status === 401 && payload.route !== "access_invitations") {
        responseCodeForStage = "trusted_route_version_mismatch";
      }
      const stage = this.resolveFailureStage({
        tokenPresent: true,
        tokenExpired: false,
        httpStatus: response.status,
        responseCode: responseCodeForStage,
        networkError: false,
      });
      const message =
        response.status === 401
          ? INVITE_ERROR_MESSAGES.authentication_required
          : response.status === 403
            ? INVITE_ERROR_MESSAGES.forbidden
            : typeof payload.message === "string" && payload.message.trim()
              ? payload.message
              : INVITE_ERROR_MESSAGES[code] ?? "Unable to create invitation.";

      this.persistDiagnostics({
        firstInvitationFailureStage: stage,
        trustedAccessSafeMessage: message,
        trustedAccessResponseCode: code,
        authAdminInviteConfigured: payload.authAdminInviteConfigured ?? null,
        authAdminInviteLastAttempted: payload.authAdminInviteAttempted ?? true,
        authAdminInviteLastSucceeded: payload.authAdminInviteSucceeded ?? false,
        authAdminInviteHttpStatus: payload.authAdminInviteHttpStatus ?? response.status,
        authAdminInviteErrorCode: payload.authAdminInviteErrorCode ?? null,
        authAdminInviteErrorCategory:
          payload.authAdminInviteErrorCategory ??
          payload.firstInvitationEmailFailureStage ??
          null,
        authAdminInviteRedirectCategory: payload.authAdminInviteRedirectCategory ?? null,
        authAdminInviteRedirectTo: payload.authAdminInviteRedirectTo ?? null,
        targetUserAlreadyExists: payload.targetUserAlreadyExists ?? null,
        firstInvitationEmailFailureStage: payload.firstInvitationEmailFailureStage ?? null,
        invitationRevokedAfterFailure: payload.invitationRevokedAfterFailure ?? null,
      });
      throw new TrustedAccessRequestError(message, code, response.status);
    }

    this.persistDiagnostics({
      firstInvitationFailureStage: "none",
      trustedAccessSafeMessage: null,
      trustedAccessResponseCode: "ok",
    });
    return payload;
  }

  createInvitation(input: {
    email: string;
    teamId?: string | null;
    teamRole?: string | null;
    platformRole?: string | null;
    projectAssignments?: Array<{ projectId: string; role: string }>;
  }) {
    return this.request(ACCESS_INVITATION_CREATE_ROUTE, "POST", input);
  }

  resendInvitation(invitationId: string) {
    return this.request(
      `/api/access/invitations/${encodeURIComponent(invitationId)}/resend`,
      "POST",
    );
  }

  revokeInvitation(invitationId: string) {
    return this.request(
      `/api/access/invitations/${encodeURIComponent(invitationId)}/revoke`,
      "POST",
    );
  }

  deleteUser(userId: string) {
    return this.request(buildAccessUserDeleteRoute(userId), "POST");
  }

  deleteTeam(teamId: string) {
    return this.request(buildAccessTeamDeleteRoute(teamId), "POST");
  }
}
