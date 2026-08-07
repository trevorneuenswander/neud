import type { AccessManagementErrorCode } from "./types";
import { parseAccessManagementError, accessManagementErrorMessage } from "./errors";
import { invokeAccessRpc } from "./rpc";
import { fetchAccessManagementDirectory } from "./directory-client";
import { createClient } from "@/lib/supabase/client";
import {
  buildAccessInviteDiagnosticContext,
  logAccessInviteFailure,
  resolveAccessInviteRuntime,
} from "./invitation-diagnostics";

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

function mapInvitationFetchFailure(error: unknown) {
  const online = typeof navigator !== "undefined" ? navigator.onLine : true;
  if (!online) {
    return parseAccessManagementError("offline_required", "offline_required");
  }

  if (error instanceof TypeError) {
    return parseAccessManagementError("invalid_request", "invalid_request");
  }

  return parseAccessManagementError("invalid_request", "invalid_request");
}

async function buildInviteRequestHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (resolveAccessInviteRuntime() !== "hosted-web") {
    return headers;
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token?.trim();
  if (error) {
    logAccessInviteFailure("invite.session_lookup_failed", buildAccessInviteDiagnosticContext(), {
      message: error.message,
    });
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function postInvitationRoute(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; invitationId?: string }> {
  const runtime = resolveAccessInviteRuntime();
  const diagnostics = buildAccessInviteDiagnosticContext();

  if (runtime === "hosted-web" && !diagnostics.online) {
    logAccessInviteFailure("invite.request", diagnostics, { path, status: "offline" });
    throw parseAccessManagementError("offline_required", "offline_required");
  }

  const headers = await buildInviteRequestHeaders();

  let response: Response;
  try {
    response = await fetch(invitationEndpoint(path), {
      method: "POST",
      headers,
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify(body),
    });
  } catch (error) {
    logAccessInviteFailure("invite.fetch_failed", diagnostics, {
      path,
      message: error instanceof Error ? error.message : "fetch_failed",
    });
    throw mapInvitationFetchFailure(error);
  }

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    code?: string;
    invitationId?: string;
  };

  if (!response.ok || !payload.ok) {
    const code = (payload.code ?? "forbidden").trim() as AccessManagementErrorCode;
    logAccessInviteFailure("invite.response_error", diagnostics, {
      path,
      status: response.status,
      code,
    });

    if (runtime === "hosted-web" && code === "offline_required") {
      throw parseAccessManagementError("invalid_request", "invalid_request");
    }

    throw parseAccessManagementError(code, "forbidden");
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
  supabase: import("@supabase/supabase-js").SupabaseClient,
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

export async function refreshDirectoryAfterInvitationAction(
  supabase: import("@supabase/supabase-js").SupabaseClient,
) {
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
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; code?: string };
  if (!response.ok || !body.ok) {
    throw parseAccessManagementError(body.code ?? "forbidden", "forbidden");
  }
  return { ok: true };
}
