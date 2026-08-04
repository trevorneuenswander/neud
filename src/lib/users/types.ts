import type { ApplicationRole } from "@/lib/auth/application-roles";

export type UserAccountStatus = "active" | "invited" | "deactivated";

export type UserProjectAssignment = {
  projectId: string;
  projectName: string;
  projectSlug: string;
  accessLevel: string;
  assignedAt: string;
};

export type PlatformUserListItem = {
  id: string;
  fullName: string | null;
  team: string | null;
  email: string;
  role: ApplicationRole;
  accountStatus: UserAccountStatus;
  assignedProjectCount: number;
  createdAt: string;
  lastSignInAt: string | null;
  projectAssignments: UserProjectAssignment[];
};

export type UserActionState = {
  error: string | null;
  success: string | null;
};

export const initialUserActionState: UserActionState = {
  error: null,
  success: null,
};

export const ASSIGNABLE_APPLICATION_ROLES: ApplicationRole[] = [
  "owner",
  "admin",
  "operator",
  "viewer",
];

export const ADMIN_ASSIGNABLE_ROLES: ApplicationRole[] = [
  "admin",
  "operator",
  "viewer",
];

export const OWNER_ASSIGNABLE_ROLES: ApplicationRole[] = [
  "owner",
  "admin",
  "operator",
  "viewer",
];
