/** Mirror of shared/access-management/access-invitation-probe.ts for diagnose scripts. */

export const ACCESS_INVITATION_PROBE_ROUTE = "/api/access/invitations/probe";
export const ACCESS_INVITATIONS_PROBE_ROUTE_MARKER = "access_invitations_probe";
export const ACCESS_INVITATIONS_CREATE_ROUTE_MARKER = "access_invitations";

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
];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function unwrapAccessInvitationProbePayload(payload) {
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

function unresolvedServiceFields() {
  return {
    invitationServiceConfigured: null,
    createInvitationRpcAvailable: null,
    authAdminInviteCapabilityAvailable: null,
  };
}

export function parseAccessInvitationProbeBody(body, options = {}) {
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
  const trustedAccessCallerResolved = raw.trustedAccessCallerResolved === true;
  const authSourceRaw = raw.trustedAccessAuthSource;
  const trustedAccessAuthSource =
    authSourceRaw === "bearer" || authSourceRaw === "browser_session"
      ? authSourceRaw
      : authSourceRaw === "cookie"
        ? "browser_session"
        : null;

  const explicitStage =
    typeof raw.firstInvitationFailureStage === "string"
      ? raw.firstInvitationFailureStage
      : null;

  let firstInvitationFailureStage;
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

  const httpStatus = options.httpStatus ?? 200;
  const ok =
    trustedAccessCallerResolved &&
    firstInvitationFailureStage === "none" &&
    httpStatus >= 200 &&
    httpStatus < 300;

  return {
    ok,
    trustedAccessCallerResolved,
    trustedAccessAuthSource,
    callerUserIdPresent: raw.callerUserIdPresent === true,
    callerIsSoleOwner: raw.callerIsSoleOwner === true,
    callerHasSiteWideAccess: raw.callerHasSiteWideAccess === true,
    invitationServiceConfigured:
      raw.invitationServiceConfigured === true
        ? true
        : raw.invitationServiceConfigured === false
          ? false
          : null,
    createInvitationRpcAvailable:
      raw.createInvitationRpcAvailable === true
        ? true
        : raw.createInvitationRpcAvailable === false
          ? false
          : null,
    authAdminInviteCapabilityAvailable:
      raw.authAdminInviteCapabilityAvailable === true
        ? true
        : raw.authAdminInviteCapabilityAvailable === false
          ? false
          : null,
    firstInvitationFailureStage,
    probeFieldsPresent,
    route: responseRoute,
    contractVersion,
  };
}

export function deriveDiagnosticInvitationFailureStage(input) {
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
    if (input.persistedStage && input.persistedStage !== "desktop_shared_auth_unavailable") {
      return input.persistedStage;
    }
    return "probe_response_invalid";
  }

  if (!input.sharedCloudAuthAvailable) {
    return "desktop_shared_auth_unavailable";
  }
  if (input.accessTokenPresent !== true) {
    return "desktop_access_token_missing";
  }

  return "probe_response_invalid";
}
