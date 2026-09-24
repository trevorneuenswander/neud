#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRepoRoot, loadLiveValidationEnv } from "./lib/env.mjs";
import { readLocalBroadArrowState } from "./lib/local-neud-db.mjs";
import { sanitizeError } from "./lib/sanitize.mjs";
import { resolveLocalApiOrigin } from "./lib/shared-local-api-origin.mjs";
import {
  ACCESS_INVITATION_PROBE_ROUTE,
  deriveDiagnosticInvitationFailureStage,
  parseAccessInvitationProbeBody,
} from "./lib/access-invitation-probe.mjs";
import {
  classifyTrustedPortalOriginCategory,
  resolveTrustedPortalOriginForDiagnose,
} from "./lib/trusted-portal-origin.mjs";

async function probeLocalInvitationAuth(localApiOrigin, sessionToken) {
  try {
    const headers = { Accept: "application/json" };
    const diagnosticBearerPresent = Boolean(sessionToken);
    if (sessionToken) {
      headers["x-neud-local-session"] = sessionToken;
    }
    const response = await fetch(`${localApiOrigin}/api/access/cloud/invitations/probe`, {
      method: "GET",
      headers,
    });
    let jsonParseFailed = false;
    const payload = await response.json().catch(() => {
      jsonParseFailed = true;
      return {};
    });
    const parsed = parseAccessInvitationProbeBody(payload, {
      httpStatus: response.status,
      jsonParseFailed,
      requireRouteMarker: true,
    });
    return {
      trustedAccessAuthProbeAttempted: true,
      trustedAccessHttpStatus: response.status,
      probePayload: payload,
      parsedProbe: parsed,
      diagnosticBearerPresent,
      localApiReceivedAuthorization: diagnosticBearerPresent,
    };
  } catch (error) {
    return {
      trustedAccessAuthProbeAttempted: false,
      trustedAccessHttpStatus: null,
      probePayload: null,
      parsedProbe: null,
      probeError: sanitizeError(error).message,
      diagnosticBearerPresent: Boolean(sessionToken),
      localApiReceivedAuthorization: Boolean(sessionToken),
    };
  }
}

async function main() {
  const repoRoot = getRepoRoot(import.meta.url);
  loadLiveValidationEnv(repoRoot);

  const localState = await readLocalBroadArrowState(repoRoot);
  const shared = localState.sharedCloudAuth ?? {};
  const trustedAccess = localState.trustedAccessDiagnostics ?? null;
  const { resolvedLocalApiOrigin: localApiOrigin, sessionToken } = resolveLocalApiOrigin({
    appDataRoot: process.env.APPDATA,
  });

  const sharedCloudAuthAvailable = Boolean(
    shared.authenticatedClientReady && !shared.reauthenticationRequired,
  );

  const trustedPortal = resolveTrustedPortalOriginForDiagnose(process.env);

  const liveProbe = localState.available
    ? await probeLocalInvitationAuth(localApiOrigin, sessionToken)
    : {
        trustedAccessAuthProbeAttempted: false,
        trustedAccessHttpStatus: null,
        probePayload: null,
        parsedProbe: null,
        diagnosticBearerPresent: false,
        localApiReceivedAuthorization: false,
      };

  const parsedProbe = liveProbe.parsedProbe;
  const probePayload = liveProbe.probePayload ?? {};

  const liveProbeRoute = probePayload.trustedAccessRoute ?? ACCESS_INVITATION_PROBE_ROUTE;

  const persistedMutationRoute =
    trustedAccess?.trustedAccessRoute === "/api/access/invitations"
      ? trustedAccess.trustedAccessRoute
      : null;

  const firstInvitationFailureStage = deriveDiagnosticInvitationFailureStage({
    sharedCloudAuthAvailable,
    accessTokenPresent: shared.accessTokenPresent ?? null,
    accessTokenExpired: shared.accessTokenExpired ?? null,
    probe: parsedProbe,
    persistedStage: null,
  });

  const summary = {
    sharedCloudAuthAvailable,
    authenticatedClientReady: shared.authenticatedClientReady ?? null,
    accessTokenPresent: shared.accessTokenPresent ?? null,
    accessTokenExpired: shared.accessTokenExpired ?? null,
    trustedAccessRoute: liveProbeRoute,
    persistedMutationTrustedAccessRoute: persistedMutationRoute,
    trustedPortalOriginHost: trustedPortal.origin ? new URL(trustedPortal.origin).host : null,
    trustedPortalOriginCategory: trustedPortal.origin
      ? classifyTrustedPortalOriginCategory(trustedPortal.origin)
      : "unknown",
    trustedPortalOriginSource: trustedPortal.source,
    trustedAccessAuthProbeAttempted: liveProbe.trustedAccessAuthProbeAttempted,
    trustedAccessAuthorizationHeaderAttached:
      probePayload.trustedAccessAuthorizationHeaderAttached ??
      probePayload.hostedRequestAuthorizationAttached ??
      null,
    trustedAccessHttpStatus: liveProbe.trustedAccessHttpStatus ?? null,
    trustedAccessCallerResolved: parsedProbe?.trustedAccessCallerResolved ?? false,
    trustedAccessAuthSource: parsedProbe?.trustedAccessAuthSource ?? null,
    callerUserIdPresent: parsedProbe?.callerUserIdPresent ?? null,
    callerIsSoleOwner: parsedProbe?.callerIsSoleOwner ?? null,
    callerHasSiteWideAccess: parsedProbe?.callerHasSiteWideAccess ?? null,
    invitationServiceConfigured: parsedProbe?.invitationServiceConfigured ?? null,
    createInvitationRpcAvailable: parsedProbe?.createInvitationRpcAvailable ?? null,
    authAdminInviteCapabilityAvailable:
      parsedProbe?.authAdminInviteCapabilityAvailable ?? null,
    firstInvitationFailureStage,
    hopDiagnostics: {
      diagnosticBearerPresent: liveProbe.diagnosticBearerPresent ?? null,
      localApiReceivedAuthorization: liveProbe.localApiReceivedAuthorization ?? null,
      localApiCloudBearerExpected: probePayload.localApiCloudBearerExpected ?? false,
      localApiCloudBearerPresent: probePayload.localApiCloudBearerPresent ?? false,
      trustedClientTokenPresent: probePayload.trustedClientTokenPresent ?? null,
      hostedRequestAuthorizationAttached: probePayload.hostedRequestAuthorizationAttached ?? null,
      hostedRouteAuthorizationHeaderPresent:
        probePayload.hostedRouteAuthorizationHeaderPresent ?? null,
      hostedRouteBearerParsed: probePayload.hostedRouteBearerParsed ?? null,
      hostedRouteGetUserAttempted: probePayload.hostedRouteGetUserAttempted ?? null,
      hostedRouteGetUserSucceeded: probePayload.hostedRouteGetUserSucceeded ?? null,
      hostedRouteCallerResolved: probePayload.hostedRouteCallerResolved ?? null,
      hostedRouteAuthSource: probePayload.hostedRouteAuthSource ?? null,
      getUserErrorCode: probePayload.getUserErrorCode ?? null,
      getUserSafeCategory: probePayload.getUserSafeCategory ?? null,
    },
    persistedTrustedAccessDiagnostics: trustedAccess,
    localApiOrigin,
    localDatabaseAvailable: localState.available,
    probeError: liveProbe.probeError ?? null,
    probeResponseShape: {
      topLevelOk: probePayload.ok ?? null,
      routeMarker: probePayload.route ?? parsedProbe?.route ?? null,
      contractVersion: probePayload.contractVersion ?? parsedProbe?.contractVersion ?? null,
      probeFieldsPresent: parsedProbe?.probeFieldsPresent ?? null,
    },
    persistedMutationDiagnostics:
      persistedMutationRoute && trustedAccess
        ? {
            trustedAccessHttpStatus: trustedAccess.trustedAccessHttpStatus ?? null,
            trustedAccessResponseCode: trustedAccess.trustedAccessResponseCode ?? null,
            firstInvitationFailureStage: trustedAccess.firstInvitationFailureStage ?? null,
          }
        : null,
    authAdminInviteConfigured: trustedAccess?.authAdminInviteConfigured ?? null,
    authAdminInviteLastAttempted: trustedAccess?.authAdminInviteLastAttempted ?? null,
    authAdminInviteLastSucceeded: trustedAccess?.authAdminInviteLastSucceeded ?? null,
    authAdminInviteHttpStatus: trustedAccess?.authAdminInviteHttpStatus ?? null,
    authAdminInviteErrorCode: trustedAccess?.authAdminInviteErrorCode ?? null,
    authAdminInviteErrorCategory:
      trustedAccess?.authAdminInviteErrorCategory ??
      trustedAccess?.firstInvitationEmailFailureStage ??
      null,
    authAdminInviteRedirectCategory: trustedAccess?.authAdminInviteRedirectCategory ?? null,
    authAdminInviteRedirectTo: trustedAccess?.authAdminInviteRedirectTo ?? null,
    targetUserAlreadyExists: trustedAccess?.targetUserAlreadyExists ?? null,
    firstInvitationEmailFailureStage: trustedAccess?.firstInvitationEmailFailureStage ?? null,
    invitationRevokedAfterFailure: trustedAccess?.invitationRevokedAfterFailure ?? null,
    supabaseRedirectAllowlistHint:
      "Add http://127.0.0.1:3000/auth/confirm and http://localhost:3000/auth/confirm (Supabase matches exact redirect URLs; localhost vs 127.0.0.1 are distinct).",
  };

  const outputPath = path.join(repoRoot, "docs", "access-invitation-diagnostic.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outputPath}`);
}

main().catch((error) => {
  console.error(sanitizeError(error).message);
  process.exit(1);
});
