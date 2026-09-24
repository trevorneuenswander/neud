import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  categorizeGetUserError,
  mapHostedAuthSourceToProbeSource,
  type AccessInvitationProbeAuthSource,
} from "@/lib/access-management/access-invitation-probe";
import { resolveHostedRouteSession } from "@/lib/auth/hosted-route-session";

export type TrustedAccessAuthSource = "cookie" | "bearer";

export type ResolvedTrustedAccessCaller =
  | {
      ok: true;
      userId: string;
      supabase: SupabaseClient;
      authSource: TrustedAccessAuthSource;
    }
  | {
      ok: false;
      code: string;
      authSource: TrustedAccessAuthSource | "none";
      status: number;
      claimsError: string | null;
    };

export type TrustedAccessRequestAuthDiagnostics = {
  postAuthorizationHeaderPresent: boolean;
  postBearerParsed: boolean;
  postBearerLengthPresent: boolean;
  postGetUserAttempted: boolean;
  postGetUserSucceeded: boolean;
  postGetUserErrorCode: string | null;
  postGetUserSafeCategory: string | null;
  postCallerResolved: boolean;
  postAuthSource: AccessInvitationProbeAuthSource;
};

export function readTrustedAccessRequestAuthDiagnostics(
  request: Request,
): Pick<
  TrustedAccessRequestAuthDiagnostics,
  "postAuthorizationHeaderPresent" | "postBearerParsed" | "postBearerLengthPresent"
> {
  const authHeader = request.headers.get("authorization");
  const postAuthorizationHeaderPresent = Boolean(authHeader?.trim());
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  return {
    postAuthorizationHeaderPresent,
    postBearerParsed: Boolean(bearerToken),
    postBearerLengthPresent: Boolean(bearerToken && bearerToken.length > 0),
  };
}

export async function resolveTrustedAccessCallerWithAuthDiagnostics(
  request: Request,
): Promise<{
  caller: ResolvedTrustedAccessCaller;
  diagnostics: TrustedAccessRequestAuthDiagnostics;
}> {
  const headerDiagnostics = readTrustedAccessRequestAuthDiagnostics(request);
  const caller = await resolveTrustedAccessCaller(request);

  const postGetUserAttempted =
    headerDiagnostics.postBearerParsed && headerDiagnostics.postBearerLengthPresent;
  const postGetUserSucceeded =
    postGetUserAttempted && caller.ok && caller.authSource === "bearer";
  const postGetUserErrorCode =
    postGetUserAttempted && !caller.ok && caller.authSource === "bearer"
      ? caller.claimsError
      : null;

  return {
    caller,
    diagnostics: {
      ...headerDiagnostics,
      postGetUserAttempted,
      postGetUserSucceeded,
      postGetUserErrorCode,
      postGetUserSafeCategory: categorizeGetUserError(postGetUserErrorCode),
      postCallerResolved: caller.ok,
      postAuthSource: caller.ok
        ? mapHostedAuthSourceToProbeSource(caller.authSource)
        : mapHostedAuthSourceToProbeSource(caller.authSource),
    },
  };
}

export async function resolveTrustedAccessCaller(
  request: Request,
): Promise<ResolvedTrustedAccessCaller> {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  const session = await resolveHostedRouteSession(request, { bearerToken });
  if (!session.ok) {
    return {
      ok: false,
      code: session.code,
      authSource: session.authMethod,
      status: 401,
      claimsError: session.claimsError,
    };
  }

  return {
    ok: true,
    userId: session.userId,
    supabase: session.supabase,
    authSource: session.authMethod,
  };
}
