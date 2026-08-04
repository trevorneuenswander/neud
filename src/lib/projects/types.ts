import type { ProjectAccessLevelWithAdmin } from "@/lib/projects/constants";
import type { ProjectRole } from "@/lib/projects/project-permissions";
import { isPlatformAdministrator } from "@/lib/auth/platform-permissions";
import type { PlatformRole, ProfileWithEmail, Project, ProjectMemberWithProfile } from "@/types/database";

export type ProjectAccessContext = {
  project: Project;
  accessLevel: ProjectAccessLevelWithAdmin;
  isPlatformAdmin: boolean;
  canManageMembers: boolean;
  canManageSettings: boolean;
  canOperateDisplays: boolean;
  projectRole: ProjectRole;
};

export type ProjectListItem = Project & {
  accessLevel: ProjectAccessLevelWithAdmin;
  teams?: Array<{ id: string; name: string }>;
};

export type AssignableUser = Pick<
  ProfileWithEmail,
  "id" | "full_name" | "email" | "team" | "role"
>;

export type ProjectMemberRow = ProjectMemberWithProfile;

export function isPlatformAdminRole(role: PlatformRole): boolean {
  return isPlatformAdministrator({ role });
}
