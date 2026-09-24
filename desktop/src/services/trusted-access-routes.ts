export const ACCESS_INVITATION_CREATE_ROUTE = "/api/access/invitations";
export const ACCESS_INVITATION_PROBE_ROUTE = "/api/access/invitations/probe";

export const ACCESS_INVITATIONS_CREATE_ROUTE_MARKER = "access_invitations";
export const ACCESS_INVITATIONS_PROBE_ROUTE_MARKER = "access_invitations_probe";

export const ACCESS_USER_DELETE_ROUTE_MARKER = "access_user_delete";

export const TRUSTED_ACCESS_CONTRACT_VERSION = 1;

export function buildAccessUserDeleteRoute(userId: string): string {
  return `/api/access/users/${encodeURIComponent(userId)}/delete`;
}

export const ACCESS_TEAM_DELETE_ROUTE_MARKER = "access_team_delete";

export function buildAccessTeamDeleteRoute(teamId: string): string {
  return `/api/access/teams/${encodeURIComponent(teamId)}/delete`;
}
