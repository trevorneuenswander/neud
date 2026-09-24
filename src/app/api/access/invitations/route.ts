import { z } from "zod";
import {
  checkInvitationRateLimit,
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
} from "@/lib/access-management/invitation-server";
import { resolveTrustedAccessCallerWithAuthDiagnostics } from "@/lib/access-management/resolve-trusted-access-caller";
import {
  ACCESS_INVITATIONS_CREATE_ROUTE_MARKER,
  TRUSTED_ACCESS_CONTRACT_VERSION,
} from "@/lib/access-management/trusted-access-routes";
import { sendAuthAdminInviteEmail } from "@/lib/access-management/send-auth-admin-invite";
import { logHostedRouteSessionDiagnostics } from "@/lib/auth/hosted-route-session";
import { getSiteOrigin } from "@/lib/auth/site-origin";
import { requestHasSupabaseAuthCookies } from "@/lib/supabase/route-handler";

const inviteSchema = z.object({
  email: z.string().email(),
  teamId: z.string().uuid().nullable().optional(),
  teamRole: z.enum(["owner", "admin", "member"]).nullable().optional(),
  platformRole: z.string().nullable().optional(),
  projectAssignments: z
    .array(
      z.object({
        projectId: z.string().uuid(),
        role: z.enum(["manager", "operator", "viewer"]),
      }),
    )
    .optional(),
});

export async function POST(request: Request) {
  const { caller, diagnostics } = await resolveTrustedAccessCallerWithAuthDiagnostics(request);
  const hasAuthCookies = requestHasSupabaseAuthCookies(request);
  const routeMarker = {
    route: ACCESS_INVITATIONS_CREATE_ROUTE_MARKER,
    contractVersion: TRUSTED_ACCESS_CONTRACT_VERSION,
  };

  if (!caller.ok) {
    logHostedRouteSessionDiagnostics({
      runtime: "hosted-web",
      authMethod: caller.authSource,
      hasAuthCookies,
      authenticatedUserResolved: false,
      userId: null,
      claimsError: caller.claimsError,
      stage: "invite.authentication_required",
    });
    return Response.json(
      {
        ok: false,
        code: caller.code,
        ...routeMarker,
        postAuthorizationHeaderPresent: diagnostics.postAuthorizationHeaderPresent,
        postBearerParsed: diagnostics.postBearerParsed,
        postBearerLengthPresent: diagnostics.postBearerLengthPresent,
        postGetUserAttempted: diagnostics.postGetUserAttempted,
        postGetUserSucceeded: diagnostics.postGetUserSucceeded,
        postGetUserErrorCode: diagnostics.postGetUserErrorCode,
        postGetUserSafeCategory: diagnostics.postGetUserSafeCategory,
        postCallerResolved: diagnostics.postCallerResolved,
        postAuthSource: diagnostics.postAuthSource,
      },
      { status: caller.status },
    );
  }

  const verified = {
    ok: true as const,
    userId: caller.userId,
    supabase: caller.supabase,
    authSource: caller.authSource,
  };

  if (!checkInvitationRateLimit(`invite:${verified.userId}`)) {
    return Response.json({ ok: false, code: "forbidden" }, { status: 429 });
  }

  const body = inviteSchema.parse(await request.json());
  const rawToken = generateInvitationToken();
  const tokenHash = hashInvitationToken(rawToken);
  const expiresAt = invitationExpiresAt();

  const { data, error } = await verified.supabase.rpc("create_cloud_invitation", {
    p_email: body.email,
    p_team_id: body.teamId ?? null,
    p_team_role: body.teamRole ?? null,
    p_platform_role: body.platformRole ?? null,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
    p_project_assignments: body.projectAssignments ?? [],
  });

  if (error || !data || typeof data !== "object" || !(data as { ok?: boolean }).ok) {
    const code = (data as { code?: string } | null)?.code ?? "forbidden";
    logHostedRouteSessionDiagnostics({
      runtime: "hosted-web",
      authMethod: request.headers.get("authorization") ? "bearer" : "cookie",
      hasAuthCookies: requestHasSupabaseAuthCookies(request),
      authenticatedUserResolved: true,
      userId: verified.userId,
      claimsError: error?.message ?? null,
      stage: "invite.authorization_or_rpc_failed",
    }, {
      rpcCode: code,
      teamId: body.teamId ?? null,
    });
    return Response.json(
      { ok: false, code },
      { status: 400 },
    );
  }

  const invitationId = (data as { invitation_id?: string }).invitation_id ?? null;
  if (!invitationId) {
    return Response.json({ ok: false, code: "invalid_request" }, { status: 400 });
  }

  const requestSiteOrigin = await getSiteOrigin();
  const emailResult = await sendAuthAdminInviteEmail({
    email: body.email,
    invitationToken: rawToken,
    invitationId,
    callerSupabase: verified.supabase,
    requestSiteOrigin,
  });

  if (!emailResult.ok) {
    logHostedRouteSessionDiagnostics(
      {
        runtime: "hosted-web",
        authMethod: request.headers.get("authorization") ? "bearer" : "cookie",
        hasAuthCookies: requestHasSupabaseAuthCookies(request),
        authenticatedUserResolved: true,
        userId: verified.userId,
        claimsError: emailResult.invitationEmailDiagnostics.authAdminInviteErrorCode,
        stage: "invite.auth_admin_invite_failed",
      },
      {
        teamId: body.teamId ?? null,
        emailFailureStage: emailResult.invitationEmailDiagnostics.firstInvitationEmailFailureStage,
        invitationRevokedAfterFailure:
          emailResult.invitationEmailDiagnostics.invitationRevokedAfterFailure,
      },
    );
    return Response.json(
      {
        ok: false,
        code: emailResult.responseCode,
        message: emailResult.safeMessage,
        ...emailResult.invitationEmailDiagnostics,
      },
      { status: 400 },
    );
  }

  return Response.json({
    ok: true,
    invitationId,
    ...routeMarker,
    ...emailResult.invitationEmailDiagnostics,
  });
}
