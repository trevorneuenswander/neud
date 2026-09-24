import {
  ACCESS_MANAGEMENT_DIRECTORY_RPC_NAME,
  ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS,
} from "@/lib/access-management/directory-rpc";
import {
  checkInvitationRateLimit,
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
} from "@/lib/access-management/invitation-server";
import { sendAuthAdminInviteEmail } from "@/lib/access-management/send-auth-admin-invite";
import { verifyAuthenticatedAccessRequest } from "@/lib/access-management/verify-access-request";
import { getSiteOrigin } from "@/lib/auth/site-origin";

type RouteContext = {
  params: Promise<{ invitationId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const verified = await verifyAuthenticatedAccessRequest(_request);
  if (!verified.ok) {
    return Response.json({ ok: false, code: verified.code }, { status: verified.status });
  }

  const { invitationId } = await context.params;
  if (!checkInvitationRateLimit(`resend:${verified.userId}:${invitationId}`)) {
    return Response.json({ ok: false, code: "forbidden" }, { status: 429 });
  }

  const rawToken = generateInvitationToken();
  const tokenHash = hashInvitationToken(rawToken);
  const expiresAt = invitationExpiresAt();

  const { data, error } = await verified.supabase.rpc("resend_cloud_invitation", {
    p_invitation_id: invitationId,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });

  if (error || !data || typeof data !== "object" || !(data as { ok?: boolean }).ok) {
    return Response.json(
      { ok: false, code: (data as { code?: string } | null)?.code ?? "forbidden" },
      { status: 400 },
    );
  }

  const directory = await verified.supabase.rpc(
    ACCESS_MANAGEMENT_DIRECTORY_RPC_NAME,
    ACCESS_MANAGEMENT_DIRECTORY_RPC_PARAMS,
  );
  const invitations =
    directory.data &&
    typeof directory.data === "object" &&
    Array.isArray((directory.data as { invitations?: unknown[] }).invitations)
      ? ((directory.data as { invitations: Array<{ id: string; email: string }> }).invitations ?? [])
      : [];
  const invitation = invitations.find((entry) => entry.id === invitationId);
  if (invitation?.email) {
    const requestSiteOrigin = await getSiteOrigin();
    const emailResult = await sendAuthAdminInviteEmail({
      email: invitation.email,
      invitationToken: rawToken,
      invitationId,
      callerSupabase: verified.supabase,
      requestSiteOrigin,
      revokeInvitationOnFailure: false,
    });
    if (!emailResult.ok) {
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
  }

  return Response.json({ ok: true });
}
