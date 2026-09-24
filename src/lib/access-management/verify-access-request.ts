import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logHostedRouteSessionDiagnostics } from "@/lib/auth/hosted-route-session";
import { requestHasSupabaseAuthCookies } from "@/lib/supabase/route-handler";
import { resolveTrustedAccessCaller } from "@/lib/access-management/resolve-trusted-access-caller";

export type VerifiedAccessRequest =
  | { ok: true; userId: string; supabase: SupabaseClient; authSource: "cookie" | "bearer" }
  | { ok: false; status: number; code: string };

export async function verifyAuthenticatedAccessRequest(
  request: Request,
): Promise<VerifiedAccessRequest> {
  const caller = await resolveTrustedAccessCaller(request);
  const hasAuthCookies = requestHasSupabaseAuthCookies(request);

  logHostedRouteSessionDiagnostics({
    runtime: "hosted-web",
    authMethod: caller.ok ? caller.authSource : caller.authSource,
    hasAuthCookies,
    authenticatedUserResolved: caller.ok,
    userId: caller.ok ? caller.userId : null,
    claimsError: caller.ok ? null : caller.claimsError,
    stage: caller.ok ? "session.resolved" : "session.missing",
  });

  if (!caller.ok) {
    return { ok: false, status: caller.status, code: caller.code };
  }

  return {
    ok: true,
    userId: caller.userId,
    supabase: caller.supabase,
    authSource: caller.authSource,
  };
}
