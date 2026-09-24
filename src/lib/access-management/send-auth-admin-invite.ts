import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifyAuthAdminInviteFailure,
  createAuthAdminInviteSuccessDiagnostics,
  mapInvitationEmailFailureMessage,
  mapInvitationEmailFailureToResponseCode,
  parseRedirectDiagnostics,
  type ClassifiedAuthAdminInviteFailure,
} from "@/lib/access-management/auth-admin-invite";
import { buildSupabaseInviteRedirectTo } from "@/lib/access-management/invitation-redirect";

export type SendAuthAdminInviteResult =
  | {
      ok: true;
      invitationEmailDiagnostics: ReturnType<typeof createAuthAdminInviteSuccessDiagnostics> & {
        authAdminInviteRedirectTo: string;
        resolvedInvitationRedirectOrigin: string;
        resolvedInvitationRedirectPath: string;
        resolvedInvitationRedirectSource: string;
        redirectHost: string | null;
        redirectProtocol: string | null;
        authAdminInviteRedirectCategory: string;
        redirectAllowedCandidate: boolean;
        authAdminInviteConfigured: true;
      };
    }
  | {
      ok: false;
      responseCode: string;
      safeMessage: string;
      invitationEmailDiagnostics: ClassifiedAuthAdminInviteFailure & {
        authAdminInviteRedirectTo: string;
        resolvedInvitationRedirectOrigin: string;
        resolvedInvitationRedirectPath: string;
        resolvedInvitationRedirectSource: string;
        redirectHost: string | null;
        redirectProtocol: string | null;
        authAdminInviteRedirectCategory: string;
        redirectAllowedCandidate: boolean;
        authAdminInviteConfigured: boolean;
        invitationRevokedAfterFailure: boolean;
      };
    };

async function revokePendingInvitation(
  supabase: SupabaseClient,
  invitationId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("revoke_cloud_invitation", {
    p_invitation_id: invitationId,
  });
  if (error || !data || typeof data !== "object") {
    return false;
  }
  return (data as { ok?: boolean }).ok === true;
}

function buildRedirectDiagnostics(requestSiteOrigin: string | null) {
  const inviteRedirect = buildSupabaseInviteRedirectTo({ requestSiteOrigin });
  const redirectParts = parseRedirectDiagnostics(inviteRedirect.generatedInviteRedirectUrl);
  return {
    inviteRedirect,
    redirectParts,
    baseDiagnostics: {
      authAdminInviteRedirectTo: inviteRedirect.generatedInviteRedirectUrl,
      resolvedInvitationRedirectOrigin: inviteRedirect.resolvedInvitationRedirectOrigin,
      resolvedInvitationRedirectPath: inviteRedirect.generatedInviteRedirectPath,
      resolvedInvitationRedirectSource: inviteRedirect.resolvedInvitationRedirectSource,
      ...redirectParts,
      redirectAllowedCandidate:
        redirectParts.authAdminInviteRedirectCategory === "localhost_dev" ||
        redirectParts.authAdminInviteRedirectCategory === "vercel_preview" ||
        redirectParts.authAdminInviteRedirectCategory === "production",
    },
  };
}

export async function sendAuthAdminInviteEmail(input: {
  email: string;
  invitationToken: string;
  invitationId: string;
  callerSupabase: SupabaseClient;
  requestSiteOrigin: string | null;
  revokeInvitationOnFailure?: boolean;
}): Promise<SendAuthAdminInviteResult> {
  const revokeOnFailure = input.revokeInvitationOnFailure !== false;
  const { inviteRedirect, redirectParts, baseDiagnostics } = buildRedirectDiagnostics(
    input.requestSiteOrigin,
  );

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    const failure = classifyAuthAdminInviteFailure({
      message: "service role client unavailable",
      status: 503,
      name: "AuthAdminClientError",
      code: "service_config_missing",
    });
    return {
      ok: false,
      responseCode: "invitation_service_unavailable",
      safeMessage: failure.authAdminInviteSafeMessage,
      invitationEmailDiagnostics: {
        ...failure,
        ...baseDiagnostics,
        authAdminInviteConfigured: false,
        invitationRevokedAfterFailure: revokeOnFailure
          ? await revokePendingInvitation(input.callerSupabase, input.invitationId)
          : false,
      },
    };
  }

  const invite = await admin.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: inviteRedirect.generatedInviteRedirectUrl,
    data: { invitation_token: input.invitationToken },
  });

  if (invite.error) {
    const failure = classifyAuthAdminInviteFailure({
      message: invite.error.message,
      status: invite.error.status,
      name: invite.error.name,
      code: (invite.error as { code?: string }).code ?? null,
    });

    const invitationRevokedAfterFailure = revokeOnFailure
      ? await revokePendingInvitation(input.callerSupabase, input.invitationId)
      : false;

    return {
      ok: false,
      responseCode: mapInvitationEmailFailureToResponseCode(
        failure.firstInvitationEmailFailureStage,
      ),
      safeMessage: failure.authAdminInviteSafeMessage,
      invitationEmailDiagnostics: {
        ...failure,
        ...baseDiagnostics,
        authAdminInviteConfigured: true,
        invitationRevokedAfterFailure,
      },
    };
  }

  return {
    ok: true,
    invitationEmailDiagnostics: {
      ...createAuthAdminInviteSuccessDiagnostics(),
      ...baseDiagnostics,
      authAdminInviteConfigured: true,
    },
  };
}
