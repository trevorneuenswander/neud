/** Synced from shared/access-management/access-invitation-probe.ts */
export type AccessInvitationProbeAuthSource = "bearer" | "browser_session" | null;

export type AccessInvitationProbeFailureStage =
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
  | "trusted_route_session_parse_failed"
  | "permission_check_failed"
  | "invitation_service_unavailable"
  | "auth_admin_invite_failed"
  | "network_unreachable"
  | "none";

export type AccessInvitationProbeResult = {
  ok: boolean;
  trustedAccessCallerResolved: boolean;
  trustedAccessAuthSource: AccessInvitationProbeAuthSource;
  callerUserIdPresent: boolean;
  callerIsSoleOwner: boolean;
  callerHasSiteWideAccess: boolean;
  invitationServiceConfigured: boolean | null;
  createInvitationRpcAvailable: boolean | null;
  authAdminInviteCapabilityAvailable: boolean | null;
  firstInvitationFailureStage: AccessInvitationProbeFailureStage;
  route?: string | null;
  contractVersion?: number | null;
};

export type AccessInvitationProbeHopDiagnostics = {
  diagnosticBearerPresent?: boolean;
  localApiReceivedAuthorization?: boolean;
  localApiCloudBearerExpected?: boolean;
  localApiCloudBearerPresent?: boolean;
  trustedClientTokenPresent?: boolean;
  hostedRequestAuthorizationAttached?: boolean;
  hostedRouteAuthorizationHeaderPresent?: boolean;
  hostedRouteBearerParsed?: boolean;
  hostedRouteGetUserAttempted?: boolean;
  hostedRouteGetUserSucceeded?: boolean;
  hostedRouteCallerResolved?: boolean;
  hostedRouteAuthSource?: AccessInvitationProbeAuthSource;
  getUserErrorCode?: string | null;
  getUserSafeCategory?: string | null;
  publicSupabaseConfigPresent?: boolean;
  serverAdminConfigPresent?: boolean;
};

import {
  ACCESS_INVITATIONS_CREATE_ROUTE_MARKER,
  ACCESS_INVITATIONS_PROBE_ROUTE_MARKER,
} from "./trusted-access-routes";

const PROBE_FIELD_KEYS = [
  "trustedAccessCallerResolved",
  "trustedAccessAuthSource",
  "callerUserIdPresent",
  "callerIsSoleOwner",
  "callerHasSiteWideAccess",
  "invitationServiceConfigured",
  "createInvitationRpcAvailable",
  "authAdminInviteCapabilityAvailable",
  "firstInvitationFailureStage",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mapHostedAuthSourceToProbeSource(
  source: "bearer" | "cookie" | "none" | null | undefined,
): AccessInvitationProbeAuthSource {
  if (source === "bearer") {
    return "bearer";
  }
  if (source === "cookie") {
    return "browser_session";
  }
  return null;
}

/** Unwrap local API or client envelopes: { data }, { probe }, nested ok wrappers. */
export function unwrapAccessInvitationProbePayload(
  payload: unknown,
): Record<string, unknown> {
  if (!isRecord(payload)) {
    return {};
  }

  if (isRecord(payload.probe)) {
    return payload.probe;
  }

  if (isRecord(payload.data)) {
    const data = payload.data;
    if (isRecord(data.probe)) {
      return data.probe;
    }
    return data;
  }

  return payload;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readServiceTriState(value: unknown): boolean | null {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  if (value === null) {
    return null;
  }
  return null;
}

function unresolvedServiceFields(): Pick<
  AccessInvitationProbeResult,
  | "invitationServiceConfigured"
  | "createInvitationRpcAvailable"
  | "authAdminInviteCapabilityAvailable"
> {
  return {
    invitationServiceConfigured: null,
    createInvitationRpcAvailable: null,
    authAdminInviteCapabilityAvailable: null,
  };
}

export function parseAccessInvitationProbeBody(
  body: unknown,
  options: {
    httpStatus?: number | null;
    jsonParseFailed?: boolean;
    requireRouteMarker?: boolean;
  } = {},
): AccessInvitationProbeResult & { probeFieldsPresent: boolean } {
  if (options.jsonParseFailed) {
    return {
      ok: false,
      trustedAccessCallerResolved: false,
      trustedAccessAuthSource: null,
      callerUserIdPresent: false,
      callerIsSoleOwner: false,
      callerHasSiteWideAccess: false,
      ...unresolvedServiceFields(),
      firstInvitationFailureStage: "probe_response_parse_failed",
      probeFieldsPresent: false,
      route: null,
      contractVersion: null,
    };
  }

  if (options.httpStatus === 404) {
    return {
      ok: false,
      trustedAccessCallerResolved: false,
      trustedAccessAuthSource: null,
      callerUserIdPresent: false,
      callerIsSoleOwner: false,
      callerHasSiteWideAccess: false,
      ...unresolvedServiceFields(),
      firstInvitationFailureStage: "trusted_route_version_mismatch",
      probeFieldsPresent: false,
      route: null,
      contractVersion: null,
    };
  }

  const raw = unwrapAccessInvitationProbePayload(body);
  const responseRoute = typeof raw.route === "string" ? raw.route : null;
  const contractVersion =
    typeof raw.contractVersion === "number" ? raw.contractVersion : null;

  if (options.requireRouteMarker) {
    if (responseRoute === ACCESS_INVITATIONS_CREATE_ROUTE_MARKER) {
      return {
        ok: false,
        trustedAccessCallerResolved: false,
        trustedAccessAuthSource: null,
        callerUserIdPresent: false,
        callerIsSoleOwner: false,
        callerHasSiteWideAccess: false,
        ...unresolvedServiceFields(),
        firstInvitationFailureStage: "probe_route_mismatch",
        probeFieldsPresent: false,
        route: responseRoute,
        contractVersion,
      };
    }
    if (responseRoute !== ACCESS_INVITATIONS_PROBE_ROUTE_MARKER) {
      return {
        ok: false,
        trustedAccessCallerResolved: false,
        trustedAccessAuthSource: null,
        callerUserIdPresent: false,
        callerIsSoleOwner: false,
        callerHasSiteWideAccess: false,
        ...unresolvedServiceFields(),
        firstInvitationFailureStage:
          options.httpStatus === 200 ? "probe_route_mismatch" : "trusted_route_version_mismatch",
        probeFieldsPresent: false,
        route: responseRoute,
        contractVersion,
      };
    }
  }

  const probeFieldsPresent = PROBE_FIELD_KEYS.some((key) => key in raw);

  const trustedAccessCallerResolved = readBoolean(raw.trustedAccessCallerResolved);
  const authSourceRaw = raw.trustedAccessAuthSource;
  const trustedAccessAuthSource: AccessInvitationProbeAuthSource =
    authSourceRaw === "bearer" || authSourceRaw === "browser_session"
      ? authSourceRaw
      : authSourceRaw === "cookie"
        ? "browser_session"
        : null;

  const callerUserIdPresent = readBoolean(raw.callerUserIdPresent);
  const callerIsSoleOwner = readBoolean(raw.callerIsSoleOwner);
  const callerHasSiteWideAccess = readBoolean(raw.callerHasSiteWideAccess);
  const invitationServiceConfigured = readServiceTriState(raw.invitationServiceConfigured);
  const createInvitationRpcAvailable = readServiceTriState(raw.createInvitationRpcAvailable);
  const authAdminInviteCapabilityAvailable = readServiceTriState(
    raw.authAdminInviteCapabilityAvailable,
  );

  const explicitStage =
    typeof raw.firstInvitationFailureStage === "string"
      ? (raw.firstInvitationFailureStage as AccessInvitationProbeFailureStage)
      : null;

  let firstInvitationFailureStage: AccessInvitationProbeFailureStage;
  if (explicitStage) {
    firstInvitationFailureStage = explicitStage;
  } else if (!probeFieldsPresent) {
    firstInvitationFailureStage =
      options.httpStatus === 200 ? "probe_response_invalid" : "probe_response_parse_failed";
  } else if (trustedAccessCallerResolved) {
    firstInvitationFailureStage = "none";
  } else {
    firstInvitationFailureStage = "hosted_caller_unresolved";
  }

  const ok =
    trustedAccessCallerResolved &&
    firstInvitationFailureStage === "none" &&
    (options.httpStatus ?? 200) >= 200 &&
    (options.httpStatus ?? 200) < 300;

  return {
    ok,
    trustedAccessCallerResolved,
    trustedAccessAuthSource,
    callerUserIdPresent,
    callerIsSoleOwner,
    callerHasSiteWideAccess,
    invitationServiceConfigured,
    createInvitationRpcAvailable,
    authAdminInviteCapabilityAvailable,
    firstInvitationFailureStage,
    probeFieldsPresent,
    route: responseRoute,
    contractVersion,
  };
}

export function deriveDiagnosticInvitationFailureStage(input: {
  sharedCloudAuthAvailable: boolean;
  accessTokenPresent: boolean | null;
  accessTokenExpired: boolean | null;
  probe: (AccessInvitationProbeResult & { probeFieldsPresent?: boolean }) | null;
  persistedStage?: string | null;
}): AccessInvitationProbeFailureStage {
  const probe = input.probe;
  if (probe?.trustedAccessCallerResolved && probe.firstInvitationFailureStage === "none") {
    return "none";
  }
  if (probe?.firstInvitationFailureStage && probe.firstInvitationFailureStage !== "none") {
    return probe.firstInvitationFailureStage;
  }

  if (input.sharedCloudAuthAvailable && input.accessTokenPresent === true) {
    if (input.accessTokenExpired === true) {
      return "stale_access_token_attached";
    }
    if (probe && !probe.trustedAccessCallerResolved) {
      return probe.probeFieldsPresent ? "hosted_caller_unresolved" : "probe_response_invalid";
    }
    return input.persistedStage &&
      input.persistedStage !== "desktop_shared_auth_unavailable"
      ? (input.persistedStage as AccessInvitationProbeFailureStage)
      : "probe_response_invalid";
  }

  if (!input.sharedCloudAuthAvailable) {
    return "desktop_shared_auth_unavailable";
  }
  if (input.accessTokenPresent !== true) {
    return "desktop_access_token_missing";
  }

  return "probe_response_invalid";
}

export function categorizeGetUserError(message: string | null | undefined): string {
  const normalized = (message ?? "").toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  if (normalized.includes("expired") || normalized.includes("jwt expired")) {
    return "jwt_expired";
  }
  if (normalized.includes("invalid") || normalized.includes("malformed")) {
    return "jwt_invalid";
  }
  if (normalized.includes("signature")) {
    return "jwt_signature";
  }
  return "auth_error";
}
