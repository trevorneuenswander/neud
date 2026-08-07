import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  logHostedRouteSessionDiagnostics,
  resolveHostedRouteSession,
} from "@/lib/auth/hosted-route-session";
import { requestHasSupabaseAuthCookies } from "@/lib/supabase/route-handler";

export type VerifiedAccessRequest =
  | { ok: true; userId: string; supabase: SupabaseClient }
  | { ok: false; status: number; code: string };

export async function verifyAuthenticatedAccessRequest(
  request: Request,
): Promise<VerifiedAccessRequest> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  const session = await resolveHostedRouteSession(request, { bearerToken });
  const hasAuthCookies = requestHasSupabaseAuthCookies(request);

  logHostedRouteSessionDiagnostics({
    runtime: "hosted-web",
    authMethod: session.ok ? session.authMethod : session.authMethod,
    hasAuthCookies,
    authenticatedUserResolved: session.ok,
    userId: session.ok ? session.userId : null,
    claimsError: session.ok ? null : session.claimsError,
    stage: session.ok ? "session.resolved" : "session.missing",
  });

  if (!session.ok) {
    return { ok: false, status: 401, code: session.code };
  }

  return {
    ok: true,
    userId: session.userId,
    supabase: session.supabase,
  };
}
