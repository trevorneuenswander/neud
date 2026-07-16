import type { ProjectAccessLevelWithAdmin } from "@/lib/projects/constants";
import type { PlatformRole, ProfileWithEmail, Project, ProjectMemberWithProfile } from "@/types/database";

export type ProjectAccessContext = {
  project: Project;
  accessLevel: ProjectAccessLevelWithAdmin;
  isPlatformAdmin: boolean;
  canManageMembers: boolean;
};

export type ProjectListItem = Project & {
  accessLevel: ProjectAccessLevelWithAdmin;
};

export type AssignableUser = Pick<
  ProfileWithEmail,
  "id" | "full_name" | "email" | "company" | "role"
>;

export type ProjectMemberRow = ProjectMemberWithProfile;

export function isPlatformAdminRole(role: PlatformRole): boolean {
  return role === "owner" || role === "admin";
}
