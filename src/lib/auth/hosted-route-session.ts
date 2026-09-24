import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { categorizeGetUserError } from "@/lib/access-management/access-invitation-probe";
import { createClient } from "@/lib/supabase/server";
import {
  createClientFromRequest,
  requestHasSupabaseAuthCookies,
} from "@/lib/supabase/route-handler";
import { shouldUseLocalData } from "@/lib/local/mode";

export type HostedRouteSessionResult =
  | {
      ok: true;
      userId: string;
      supabase: SupabaseClient;
      authMethod: "bearer" | "cookie";
    }
  | {
      ok: false;
      code: "authentication_required";
      authMethod: "bearer" | "cookie" | "none";
      hasAuthCookies: boolean;
      claimsError: string | null;
    };

export type HostedRouteSessionDiagnostics = {
  runtime: "hosted-web";
  authMethod: "bearer" | "cookie" | "none";
  hasAuthCookies: boolean;
  authenticatedUserResolved: boolean;
  userId: string | null;
  claimsError: string | null;
  stage: string;
};

export function logHostedRouteSessionDiagnostics(
  diagnostics: HostedRouteSessionDiagnostics,
  details: Record<string, unknown> = {},
) {
  console.info("[access-invite]", {
    ...diagnostics,
    ...details,
  });
}

/**
 * Resolves the hosted Supabase session using the same getClaims() contract as
 * requireUser()/requireAdmin() — not getUser(), which can fail while pages load.
 */
export async function resolveHostedRouteSession(
  request: Request,
  options?: { bearerToken?: string | null },
): Promise<HostedRouteSessionResult> {
  const bearerToken = options?.bearerToken?.trim() || null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const hasAuthCookies = requestHasSupabaseAuthCookies(request);

  if (bearerToken && supabaseUrl && publishableKey) {
    const { createClient: createSupabaseClient } = await import("@supabase/supabase-js");
    const tokenClient = createSupabaseClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data, error } = await tokenClient.auth.getUser(bearerToken);
    if (error || !data.user) {
      return {
        ok: false,
        code: "authentication_required",
        authMethod: "bearer",
        hasAuthCookies,
        claimsError: error?.message ?? "bearer_user_missing",
      };
    }

    const authedClient = createSupabaseClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${bearerToken}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    return {
      ok: true,
      userId: data.user.id,
      supabase: authedClient,
      authMethod: "bearer",
    };
  }

  const supabase = shouldUseLocalData()
    ? await createClient()
    : await createClientFromRequest(request);

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub?.trim() ?? null;

  if (claimsError || !userId) {
    return {
      ok: false,
      code: "authentication_required",
      authMethod: "cookie",
      hasAuthCookies,
      claimsError: claimsError?.message ?? "claims_missing",
    };
  }

  return {
    ok: true,
    userId,
    supabase,
    authMethod: "cookie",
  };
}

export type HostedRouteBearerProbeDiagnostics = {
  hostedRouteAuthorizationHeaderPresent: boolean;
  hostedRouteBearerParsed: boolean;
  hostedRouteGetUserAttempted: boolean;
  hostedRouteGetUserSucceeded: boolean;
  getUserErrorCode: string | null;
  getUserSafeCategory: string | null;
};

export async function resolveHostedRouteSessionForProbe(
  request: Request,
): Promise<HostedRouteSessionResult & { bearerProbe: HostedRouteBearerProbeDiagnostics }> {
  const authHeader = request.headers.get("authorization");
  const hostedRouteAuthorizationHeaderPresent = Boolean(authHeader?.trim());
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const hostedRouteBearerParsed = Boolean(bearerToken);
  const bearerProbe: HostedRouteBearerProbeDiagnostics = {
    hostedRouteAuthorizationHeaderPresent,
    hostedRouteBearerParsed,
    hostedRouteGetUserAttempted: false,
    hostedRouteGetUserSucceeded: false,
    getUserErrorCode: null,
    getUserSafeCategory: null,
  };

  if (bearerToken) {
    bearerProbe.hostedRouteGetUserAttempted = true;
    const session = await resolveHostedRouteSession(request, { bearerToken });
    if (!session.ok) {
      bearerProbe.getUserErrorCode = session.claimsError ?? "authentication_required";
      bearerProbe.getUserSafeCategory = categorizeGetUserError(session.claimsError);
      return { ...session, bearerProbe };
    }
    bearerProbe.hostedRouteGetUserSucceeded = true;
    return { ...session, bearerProbe };
  }

  const session = await resolveHostedRouteSession(request);
  return { ...session, bearerProbe };
}
