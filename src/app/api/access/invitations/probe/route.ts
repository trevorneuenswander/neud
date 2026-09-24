import { createAdminClient } from "@/lib/supabase/admin";
import {
  mapHostedAuthSourceToProbeSource,
  type AccessInvitationProbeFailureStage,
} from "@/lib/access-management/access-invitation-probe";
import { resolveTrustedAccessCallerWithAuthDiagnostics } from "@/lib/access-management/resolve-trusted-access-caller";
import {
  ACCESS_INVITATIONS_PROBE_ROUTE_MARKER,
  TRUSTED_ACCESS_CONTRACT_VERSION,
} from "@/lib/access-management/trusted-access-routes";
import { logHostedRouteSessionDiagnostics } from "@/lib/auth/hosted-route-session";
import { requestHasSupabaseAuthCookies } from "@/lib/supabase/route-handler";

function readServiceConfigAfterAuth() {
  const publicSupabaseConfigPresent = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  let serverAdminConfigPresent = false;
  let invitationServiceConfigured = false;
  let authAdminInviteCapabilityAvailable = false;
  try {
    const admin = createAdminClient();
    serverAdminConfigPresent = Boolean(admin);
    invitationServiceConfigured = Boolean(admin);
    authAdminInviteCapabilityAvailable = Boolean(admin.auth.admin);
  } catch {
    serverAdminConfigPresent = false;
    invitationServiceConfigured = false;
    authAdminInviteCapabilityAvailable = false;
  }

  return {
    publicSupabaseConfigPresent,
    serverAdminConfigPresent,
    invitationServiceConfigured,
    createInvitationRpcAvailable: publicSupabaseConfigPresent,
    authAdminInviteCapabilityAvailable,
  };
}

function mapProbeHop(diagnostics: Awaited<
  ReturnType<typeof resolveTrustedAccessCallerWithAuthDiagnostics>
>["diagnostics"]) {
  return {
    hostedRouteAuthorizationHeaderPresent: diagnostics.postAuthorizationHeaderPresent,
    hostedRouteBearerParsed: diagnostics.postBearerParsed,
    hostedRouteGetUserAttempted: diagnostics.postGetUserAttempted,
    hostedRouteGetUserSucceeded: diagnostics.postGetUserSucceeded,
    hostedRouteCallerResolved: diagnostics.postCallerResolved,
    hostedRouteAuthSource: diagnostics.postAuthSource,
    getUserErrorCode: diagnostics.postGetUserErrorCode,
    getUserSafeCategory: diagnostics.postGetUserSafeCategory,
  };
}

export async function GET(request: Request) {
  const hasAuthCookies = requestHasSupabaseAuthCookies(request);
  const { caller, diagnostics } = await resolveTrustedAccessCallerWithAuthDiagnostics(request);
  const hop = mapProbeHop(diagnostics);
  const trustedAccessAuthSource = mapHostedAuthSourceToProbeSource(
    caller.ok ? caller.authSource : caller.authSource,
  );

  const routeMarker = {
    route: ACCESS_INVITATIONS_PROBE_ROUTE_MARKER,
    contractVersion: TRUSTED_ACCESS_CONTRACT_VERSION,
  };

  if (!caller.ok) {
    let firstInvitationFailureStage: AccessInvitationProbeFailureStage =
      "hosted_caller_unresolved";
    if (!diagnostics.postAuthorizationHeaderPresent && !hasAuthCookies) {
      firstInvitationFailureStage = "hosted_auth_header_missing";
    } else if (
      diagnostics.postAuthorizationHeaderPresent &&
      !diagnostics.postBearerParsed
    ) {
      firstInvitationFailureStage = "hosted_bearer_parse_failed";
    } else if (diagnostics.postGetUserAttempted && !diagnostics.postGetUserSucceeded) {
      firstInvitationFailureStage = "hosted_get_user_failed";
    } else if (caller.authSource === "none") {
      firstInvitationFailureStage = "hosted_auth_header_missing";
    }

    logHostedRouteSessionDiagnostics({
      runtime: "hosted-web",
      authMethod: caller.authSource,
      hasAuthCookies,
      authenticatedUserResolved: false,
      userId: null,
      claimsError: caller.claimsError,
      stage: "invite.probe.authentication_required",
    });

    return Response.json({
      ok: false,
      code: caller.code,
      trustedAccessCallerResolved: false,
      trustedAccessAuthSource,
      callerUserIdPresent: false,
      callerIsSoleOwner: false,
      callerHasSiteWideAccess: false,
      invitationServiceConfigured: null,
      createInvitationRpcAvailable: null,
      authAdminInviteCapabilityAvailable: null,
      firstInvitationFailureStage,
      ...routeMarker,
      ...hop,
    });
  }

  const serviceConfig = readServiceConfigAfterAuth();

  const { data: profile, error: profileError } = await caller.supabase
    .from("profiles")
    .select("role")
    .eq("id", caller.userId)
    .maybeSingle();

  const role = profile?.role ?? null;
  const callerIsSoleOwner = role === "owner";
  const callerIsPlatformAdmin = role === "admin";
  const callerHasSiteWideAccess = callerIsSoleOwner || callerIsPlatformAdmin;

  logHostedRouteSessionDiagnostics({
    runtime: "hosted-web",
    authMethod: caller.authSource,
    hasAuthCookies,
    authenticatedUserResolved: true,
    userId: caller.userId,
    claimsError: profileError?.message ?? null,
    stage: "invite.probe.resolved",
  });

  return Response.json({
    ok: true,
    trustedAccessCallerResolved: true,
    trustedAccessAuthSource,
    callerUserIdPresent: Boolean(caller.userId),
    callerIsSoleOwner,
    callerHasSiteWideAccess,
    targetTeamAuthorized: callerHasSiteWideAccess,
    invitationServiceConfigured: serviceConfig.invitationServiceConfigured,
    createInvitationRpcAvailable: serviceConfig.createInvitationRpcAvailable,
    authAdminInviteCapabilityAvailable: serviceConfig.authAdminInviteCapabilityAvailable,
    firstInvitationFailureStage: "none" as const,
    publicSupabaseConfigPresent: serviceConfig.publicSupabaseConfigPresent,
    serverAdminConfigPresent: serviceConfig.serverAdminConfigPresent,
    ...routeMarker,
    ...hop,
  });
}
