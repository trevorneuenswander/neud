export type ApplicationRole = "owner" | "admin" | "operator" | "viewer";

export const APPLICATION_ROLES: ApplicationRole[] = [
  "owner",
  "admin",
  "operator",
  "viewer",
];

export const ROLE_RANK: Record<ApplicationRole, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
  owner: 4,
};

const LEGACY_ROLE_MAP: Record<string, ApplicationRole> = {
  owner: "owner",
  organization_owner: "owner",
  admin: "admin",
  operator: "operator",
  user: "operator",
  member: "operator",
  viewer: "viewer",
};

export function normalizeApplicationRole(
  raw: string | null | undefined,
): ApplicationRole {
  if (!raw) {
    return "viewer";
  }

  const normalized = raw.trim().toLowerCase();
  return LEGACY_ROLE_MAP[normalized] ?? "viewer";
}

export function getApplicationRole(
  user: { role?: string | null | undefined } | null | undefined,
): ApplicationRole {
  return normalizeApplicationRole(user?.role);
}

export function roleRank(role: ApplicationRole): number {
  return ROLE_RANK[role];
}

export function formatApplicationRole(role: ApplicationRole | string): string {
  const normalized = normalizeApplicationRole(role);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function toPersistedApplicationRole(
  role: ApplicationRole | string,
): ApplicationRole {
  const normalized = normalizeApplicationRole(role);
  if (!APPLICATION_ROLES.includes(normalized)) {
    return "viewer";
  }
  return normalized;
}

export function isElevatedApplicationRole(role: ApplicationRole): boolean {
  return role === "owner" || role === "admin";
}
