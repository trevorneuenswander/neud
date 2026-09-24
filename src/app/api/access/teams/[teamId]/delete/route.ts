import { z } from "zod";
import {
  deletePlatformTeamWithTrustedAuth,
  loadDirectoryForTrustedDelete,
} from "@/lib/access-management/delete-platform-team";
import { resolveTrustedAccessCallerWithAuthDiagnostics } from "@/lib/access-management/resolve-trusted-access-caller";
import {
  ACCESS_TEAM_DELETE_ROUTE_MARKER,
  TRUSTED_ACCESS_CONTRACT_VERSION,
} from "@/lib/access-management/trusted-access-routes";

const paramsSchema = z.object({
  teamId: z.string().uuid(),
});

type RouteContext = {
  params: Promise<{ teamId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { caller } = await resolveTrustedAccessCallerWithAuthDiagnostics(request);
  const routeMarker = {
    route: ACCESS_TEAM_DELETE_ROUTE_MARKER,
    contractVersion: TRUSTED_ACCESS_CONTRACT_VERSION,
  };

  if (!caller.ok) {
    return Response.json(
      { ok: false, code: caller.code, ...routeMarker },
      { status: caller.status },
    );
  }

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return Response.json({ ok: false, code: "invalid_team", ...routeMarker }, { status: 400 });
  }

  const directory = await loadDirectoryForTrustedDelete(caller.supabase);
  if (!directory) {
    return Response.json(
      { ok: false, code: "trusted_route_unavailable", ...routeMarker },
      { status: 503 },
    );
  }

  const result = await deletePlatformTeamWithTrustedAuth({
    actorUserId: caller.userId,
    teamId: params.data.teamId,
    directory,
  });

  if (!result.ok) {
    const status =
      result.code === "permission_denied" ||
      result.code === "team_contains_protected_users" ||
      result.code === "neud_team_protected"
        ? 403
        : result.code === "team_not_found"
          ? 404
          : 400;
    return Response.json({ ok: false, code: result.code, ...routeMarker }, { status });
  }

  return Response.json({
    ok: true,
    code: "deleted",
    deletedUserCount: result.deletedUserCount,
    ...routeMarker,
  });
}
