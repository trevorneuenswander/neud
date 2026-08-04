import {
  getApplicationRole,
  isElevatedApplicationRole,
  type ApplicationRole,
} from "@/lib/auth/application-roles";
import type { Profile, Project } from "@/types/database";

export type ActorLike =
  | Pick<Profile, "id" | "role">
  | { id?: string; role: string | null | undefined }
  | null
  | undefined;

export type ActorLikeWithRole = { id?: string; role: string | null | undefined };

function actorRole(actor: ActorLike): ApplicationRole {
  return getApplicationRole(actor);
}

export function isPlatformAdministrator(actor: ActorLike): boolean {
  return isElevatedApplicationRole(actorRole(actor));
}

export function canManageApplication(actor: ActorLike): boolean {
  return isPlatformAdministrator(actor);
}

export function canCreateProject(actor: ActorLike): boolean {
  const role = actorRole(actor);
  return role === "owner" || role === "admin";
}

export function canDeleteProject(
  actor: ActorLike,
  _project?: Project | null,
): boolean {
  const role = actorRole(actor);
  return role === "owner" || role === "admin";
}

export function canManageProject(actor: ActorLike, _project?: Project | null): boolean {
  return isPlatformAdministrator(actor);
}

export function canCreateUser(actor: ActorLike): boolean {
  return isPlatformAdministrator(actor);
}

export function canInviteUser(actor: ActorLike): boolean {
  return canCreateUser(actor);
}

export function canViewUserList(actor: ActorLike): boolean {
  return isPlatformAdministrator(actor);
}

export function canAssignUserToProject(actor: ActorLike): boolean {
  return isPlatformAdministrator(actor);
}

export function canRemoveUserFromProject(actor: ActorLike): boolean {
  return isPlatformAdministrator(actor);
}

export function canAssignRole(
  actor: ActorLike,
  targetUser: ActorLikeWithRole,
  requestedRole: string | null | undefined,
): boolean {
  const actorAppRole = actorRole(actor);
  const targetAppRole = getApplicationRole(targetUser);
  const nextRole = getApplicationRole({ role: requestedRole });

  if (actorAppRole === "viewer" || actorAppRole === "operator") {
    return false;
  }

  if (actorAppRole === "admin") {
    if (nextRole === "owner") {
      return false;
    }
    if (targetAppRole === "owner") {
      return false;
    }
    if (targetAppRole === "admin" && actor?.id !== targetUser.id) {
      return false;
    }
    return nextRole === "admin" || nextRole === "operator" || nextRole === "viewer";
  }

  if (actorAppRole === "owner") {
    return (
      nextRole === "owner" ||
      nextRole === "admin" ||
      nextRole === "operator" ||
      nextRole === "viewer"
    );
  }

  return false;
}

export function canEditUser(actor: ActorLike, targetUser: ActorLikeWithRole): boolean {
  const actorAppRole = actorRole(actor);
  const targetAppRole = getApplicationRole(targetUser);

  if (actorAppRole === "viewer" || actorAppRole === "operator") {
    return false;
  }

  if (actorAppRole === "owner") {
    if (targetAppRole === "owner") {
      return actor?.id === targetUser.id;
    }
    return true;
  }

  if (actorAppRole === "admin") {
    if (targetAppRole === "owner") {
      return false;
    }
    if (targetAppRole === "admin") {
      return actor?.id === targetUser.id;
    }
    return targetAppRole === "operator" || targetAppRole === "viewer";
  }

  return false;
}

export function canDeleteUser(
  actor: ActorLike,
  targetUser: ActorLikeWithRole,
  options?: { activeOwnerCount?: number },
): boolean {
  const actorAppRole = actorRole(actor);
  const targetAppRole = getApplicationRole(targetUser);

  if (actorAppRole === "viewer" || actorAppRole === "operator") {
    return false;
  }

  if (targetAppRole === "owner") {
    if (actorAppRole !== "owner") {
      return false;
    }
    return (options?.activeOwnerCount ?? 0) > 1;
  }

  if (targetAppRole === "admin") {
    return actorAppRole === "owner";
  }

  if (actorAppRole === "owner" || actorAppRole === "admin") {
    return targetAppRole === "operator" || targetAppRole === "viewer";
  }

  return false;
}

export function canOperateProject(
  actor: ActorLike,
  _project?: Project | null,
): boolean {
  const role = actorRole(actor);
  return role === "owner" || role === "admin" || role === "operator";
}

export function canViewProject(
  actor: ActorLike,
  _project?: Project | null,
): boolean {
  const role = actorRole(actor);
  return (
    role === "owner" ||
    role === "admin" ||
    role === "operator" ||
    role === "viewer"
  );
}

export function hasGlobalProjectAccess(actor: ActorLike): boolean {
  return isPlatformAdministrator(actor);
}
