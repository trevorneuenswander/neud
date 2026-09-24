import { z } from "zod";
import {
  deletePlatformUserWithTrustedAuth,
  loadDirectoryForTrustedDelete,
} from "@/lib/access-management/delete-platform-user";
import { resolveTrustedAccessCallerWithAuthDiagnostics } from "@/lib/access-management/resolve-trusted-access-caller";
import {
  ACCESS_USER_DELETE_ROUTE_MARKER,
  TRUSTED_ACCESS_CONTRACT_VERSION,
} from "@/lib/access-management/trusted-access-routes";
import { logHostedRouteSessionDiagnostics } from "@/lib/auth/hosted-route-session";
import { requestHasSupabaseAuthCookies } from "@/lib/supabase/route-handler";

const paramsSchema = z.object({
  userId: z.string().uuid(),
});

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { caller, diagnostics } = await resolveTrustedAccessCallerWithAuthDiagnostics(request);
  const hasAuthCookies = requestHasSupabaseAuthCookies(request);
  const routeMarker = {
    route: ACCESS_USER_DELETE_ROUTE_MARKER,
    contractVersion: TRUSTED_ACCESS_CONTRACT_VERSION,
  };

  if (!caller.ok) {
    logHostedRouteSessionDiagnostics({
      runtime: "hosted-web",
      authMethod: caller.authSource,
      hasAuthCookies,
      authenticatedUserResolved: false,
      userId: null,
      claimsError: caller.claimsError,
      stage: "user_delete.authentication_required",
    });
    return Response.json(
      {
        ok: false,
        code: caller.code,
        ...routeMarker,
        postAuthorizationHeaderPresent: diagnostics.postAuthorizationHeaderPresent,
        postBearerParsed: diagnostics.postBearerParsed,
        postBearerLengthPresent: diagnostics.postBearerLengthPresent,
        postGetUserAttempted: diagnostics.postGetUserAttempted,
        postGetUserSucceeded: diagnostics.postGetUserSucceeded,
        postGetUserErrorCode: diagnostics.postGetUserErrorCode,
        postGetUserSafeCategory: diagnostics.postGetUserSafeCategory,
        postCallerResolved: diagnostics.postCallerResolved,
        postAuthSource: diagnostics.postAuthSource,
      },
      { status: caller.status },
    );
  }

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return Response.json(
      { ok: false, code: "invalid_user", ...routeMarker },
      { status: 400 },
    );
  }

  const directory = await loadDirectoryForTrustedDelete(caller.supabase);
  if (!directory) {
    return Response.json(
      { ok: false, code: "trusted_route_unavailable", ...routeMarker },
      { status: 503 },
    );
  }

  const result = await deletePlatformUserWithTrustedAuth({
    actorUserId: caller.userId,
    targetUserId: params.data.userId,
    directory,
  });

  if (!result.ok) {
    const status =
      result.code === "permission_denied" || result.code === "owner_protected"
        ? 403
        : result.code === "user_not_found"
          ? 404
          : 400;
    return Response.json({ ok: false, code: result.code, ...routeMarker }, { status });
  }

  return Response.json({ ok: true, code: "deleted", ...routeMarker });
}
