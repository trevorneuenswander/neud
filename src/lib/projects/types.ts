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

export type ProjectPackageCardState =
  | "not_downloaded"
  | "downloaded"
  | "update_available"
  | "downloading"
  | "updating"
  | "error";

export type ProjectListItem = Project & {
  accessLevel: ProjectAccessLevelWithAdmin;
  teams?: Array<{ id: string; name: string }>;
  /** Multi-capability model (Pass 21). Not a single project.type enum. */
  capabilities?: string[];
  packageState?: ProjectPackageCardState;
  installedVersion?: number | null;
  availableVersion?: number | null;
  isPackageInstalled?: boolean;
  packageLastError?: string | null;
};

export type AssignableUser = Pick<
  ProfileWithEmail,
  "id" | "full_name" | "email" | "team" | "role"
>;

export type ProjectMemberRow = ProjectMemberWithProfile;

export function isPlatformAdminRole(role: PlatformRole): boolean {
  return isPlatformAdministrator({ role });
}
