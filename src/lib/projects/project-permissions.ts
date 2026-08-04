import { getApplicationRole } from "@/lib/auth/application-roles";

export type ProjectRole = "owner" | "admin" | "operator" | "viewer";

export function canManageProjectSettings(role: ProjectRole): boolean {
  return role === "owner" || role === "admin";
}

export function canOperateProjectDisplays(role: ProjectRole): boolean {
  return role === "owner" || role === "admin" || role === "operator";
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

export function resolveLocalProjectRole(
  authenticatedUserRole: string | null | undefined,
): ProjectRole {
  return getApplicationRole({ role: authenticatedUserRole });
}

export function resolveSupabaseProjectRole(input: {
  platformAdmin: boolean;
  profileRole: string | null | undefined;
  membershipAccessLevel: string | null | undefined;
}): ProjectRole {
  if (input.platformAdmin) {
    return getApplicationRole({ role: input.profileRole });
  }

  switch (input.membershipAccessLevel) {
    case "manager":
    case "operator":
      return "operator";
    case "viewer":
      return "viewer";
    default:
      return "viewer";
  }
}
