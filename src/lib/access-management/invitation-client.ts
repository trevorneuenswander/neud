import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAccessManagementError, accessManagementErrorMessage } from "./errors";
import { invokeAccessRpc } from "./rpc";
import { fetchAccessManagementDirectory } from "./directory-client";

export type InvitationRequestPayload = {
  email: string;
  teamId?: string | null;
  platformRole?: string | null;
  teamRole?: string | null;
  projectAssignments?: Array<{ projectId: string; role: string }>;
};

function invitationEndpoint(path: string): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

async function postInvitationRoute(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; invitationId?: string }> {
  const response = await fetch(invitationEndpoint(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    code?: string;
    invitationId?: string;
  };

  if (!response.ok || !payload.ok) {
    throw parseAccessManagementError(payload.code ?? "forbidden", "forbidden");
  }

  return { ok: true, invitationId: payload.invitationId };
}

export async function createInvitation(
  payload: InvitationRequestPayload,
): Promise<{ invitationId?: string }> {
  return postInvitationRoute("/api/access/invitations", payload);
}

export async function resendInvitation(invitationId: string): Promise<void> {
  await postInvitationRoute(`/api/access/invitations/${encodeURIComponent(invitationId)}/resend`, {});
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  await postInvitationRoute(`/api/access/invitations/${encodeURIComponent(invitationId)}/revoke`, {});
}

export async function acceptInvitation(token: string): Promise<void> {
  await postInvitationRoute("/api/access/invitations/accept", { token });
}

export async function acceptInvitationWithSession(
  supabase: SupabaseClient,
  token: string,
): Promise<void> {
  const tokenHash = await hashInvitationToken(token);
  await invokeAccessRpc(supabase, "accept_cloud_invitation", {
    p_token_hash: tokenHash,
  });
}

export async function hashInvitationToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function refreshDirectoryAfterInvitationAction(supabase: SupabaseClient) {
  return fetchAccessManagementDirectory(supabase);
}

export { accessManagementErrorMessage };

/** @deprecated Use createInvitation */
export async function requestCloudInvitation(
  endpoint: string,
  payload: InvitationRequestPayload,
): Promise<{ ok: boolean }> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; code?: string };
  if (!response.ok || !body.ok) {
    throw parseAccessManagementError(body.code ?? "forbidden", "forbidden");
  }
  return { ok: true };
}
