import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hashInvitationToken } from "@/lib/access-management/invitation-server";
import { parseAccessManagementError } from "@/lib/access-management/errors";

export type CloudInvitationAcceptanceResult =
  | { ok: true; invitationId: string | null }
  | { ok: false; userMessage: string; code: string };

function mapAcceptRpcCodeToUserMessage(code: string): string {
  switch (code) {
    case "authentication_required":
      return "Sign in to accept this invitation.";
    case "invitation_expired":
      return "This invitation has expired.";
    case "invitation_revoked":
      return "This invitation is no longer valid.";
    case "conflict":
      return "This invitation has already been accepted.";
    case "forbidden":
      return "This invitation was sent to a different email address.";
    case "owner_role_not_assignable":
      return "This invitation cannot assign the Owner role.";
    default:
      return "Unable to accept this invitation.";
  }
}

export async function finalizeCloudInvitationAcceptance(
  supabase: SupabaseClient,
): Promise<CloudInvitationAcceptanceResult> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return {
      ok: false,
      code: "authentication_required",
      userMessage: mapAcceptRpcCodeToUserMessage("authentication_required"),
    };
  }

  const rawToken = userData.user.user_metadata?.invitation_token;
  if (typeof rawToken !== "string" || rawToken.trim().length < 16) {
    return {
      ok: false,
      code: "token_param_missing",
      userMessage: "Unable to accept this invitation.",
    };
  }

  const tokenHash = hashInvitationToken(rawToken.trim());
  const { data, error } = await supabase.rpc("accept_cloud_invitation", {
    p_token_hash: tokenHash,
  });

  if (error) {
    return {
      ok: false,
      code: "acceptance_rpc_failed",
      userMessage: "Unable to accept this invitation.",
    };
  }

  const payload = data as { ok?: boolean; code?: string; invitation_id?: string } | null;
  if (!payload?.ok) {
    const code = payload?.code ?? "forbidden";
    return {
      ok: false,
      code,
      userMessage: mapAcceptRpcCodeToUserMessage(code),
    };
  }

  return {
    ok: true,
    invitationId: payload.invitation_id ?? null,
  };
}

export function toCloudInvitationAcceptanceError(error: unknown): string {
  if (error instanceof Error) {
    try {
      return parseAccessManagementError(error.message).message;
    } catch {
      return error.message;
    }
  }
  return "Unable to accept this invitation.";
}
