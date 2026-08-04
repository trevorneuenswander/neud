import { getApplicationRole } from "../auth/application-roles";

export type ProjectRole = "owner" | "admin" | "operator" | "viewer";

export function canManageProjectSettings(role: ProjectRole): boolean {
  return role === "owner" || role === "admin";
}

export function normalizeProjectIsActive(project: {
  is_active?: boolean | number | null;
  isActive?: boolean | null;
}): boolean {
  if (typeof project.isActive === "boolean") {
    return project.isActive;
  }
  if (typeof project.is_active === "boolean") {
    return project.is_active;
  }
  if (typeof project.is_active === "number") {
    return project.is_active !== 0;
  }
  return true;
}

export function canAccessProject(
  role: ProjectRole,
  project: { is_active?: boolean | number | null; isActive?: boolean | null },
): boolean {
  if (normalizeProjectIsActive(project)) {
    return true;
  }
  return canManageProjectSettings(role);
}

export function resolveAuthenticatedProjectRole(
  user: { role?: string | null | undefined } | null | undefined,
): ProjectRole {
  return getApplicationRole(user);
}
