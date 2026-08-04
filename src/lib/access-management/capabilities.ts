import type { CloudTeamRole } from "./types";
import type { ResolvedAccessCapabilities } from "./role-model";

export type AccessCapabilityContext = ResolvedAccessCapabilities & {
  teamRole?: CloudTeamRole | null;
  projectRole?: string | null;
  isOnline?: boolean;
};

export function canManageTeams(context: AccessCapabilityContext): boolean {
  return context.hasSiteWideAccess;
}

export function canManageTeamUsers(
  context: AccessCapabilityContext,
  teamId?: string,
): boolean {
  if (context.hasSiteWideAccess) {
    return true;
  }
  if (teamId && context.managedTeamIds.includes(teamId)) {
    return true;
  }
  return context.teamRole === "admin";
}

export function canManageProjectAccess(context: AccessCapabilityContext): boolean {
  if (context.hasSiteWideAccess) {
    return true;
  }
  return context.projectRole === "manager" || context.projectRole === "operator";
}

export function canInviteUsers(context: AccessCapabilityContext): boolean {
  if (context.isOnline === false) {
    return false;
  }
  return context.hasSiteWideAccess || context.managedTeamIds.length > 0;
}

export function canChangeProjectRole(context: AccessCapabilityContext): boolean {
  return canManageProjectAccess(context);
}

export function canReorderDisplays(context: AccessCapabilityContext): boolean {
  return canManageProjectAccess(context);
}

export function canViewAllTeams(context: AccessCapabilityContext): boolean {
  return context.hasSiteWideAccess;
}

export function canViewAllProjects(context: AccessCapabilityContext): boolean {
  return context.hasSiteWideAccess;
}

export function canManageUsers(context: AccessCapabilityContext): boolean {
  return context.hasSiteWideAccess;
}

export function canManageInvitations(context: AccessCapabilityContext): boolean {
  return canInviteUsers(context);
}

export function canManageDisplays(context: AccessCapabilityContext): boolean {
  return canManageProjectAccess(context);
}
