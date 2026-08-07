import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkInvitationRateLimit,
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
} from "@/lib/access-management/invitation-server";
import { verifyAuthenticatedAccessRequest } from "@/lib/access-management/verify-access-request";
import { logHostedRouteSessionDiagnostics } from "@/lib/auth/hosted-route-session";
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
  const verified = await verifyAuthenticatedAccessRequest(request);
  if (!verified.ok) {
    logHostedRouteSessionDiagnostics({
      runtime: "hosted-web",
      authMethod: request.headers.get("authorization") ? "bearer" : "cookie",
      hasAuthCookies: requestHasSupabaseAuthCookies(request),
      authenticatedUserResolved: false,
      userId: null,
      claimsError: verified.code,
      stage: "invite.authentication_required",
    });
    return Response.json({ ok: false, code: verified.code }, { status: verified.status });
  }

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

  const admin = createAdminClient();
  const invite = await admin.auth.admin.inviteUserByEmail(body.email, {
    data: { invitation_token: rawToken },
  });

  if (invite.error) {
    return Response.json({ ok: false, code: "invalid_request" }, { status: 400 });
  }

  return Response.json({
    ok: true,
    invitationId: (data as { invitation_id?: string }).invitation_id ?? null,
  });
}
