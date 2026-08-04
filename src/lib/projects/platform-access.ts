import { getCurrentProfile } from "@/lib/auth/authorization";
import {
  canCreateProject,
  canDeleteProject,
} from "@/lib/auth/platform-permissions";
import { localGetProjectsMeta } from "@/lib/local/displays-api";
import { shouldUseLocalData } from "@/lib/local/mode";

export type ProjectPlatformAccess = {
  canCreateProject: boolean;
  canDeleteProject: boolean;
};

export async function getProjectPlatformAccess(): Promise<ProjectPlatformAccess> {
  if (shouldUseLocalData()) {
    try {
      const meta = await localGetProjectsMeta();
      return {
        canCreateProject: meta.canCreateProject === true,
        canDeleteProject: meta.canDeleteProject === true,
      };
    } catch {
      return {
        canCreateProject: false,
        canDeleteProject: false,
      };
    }
  }

  const profile = await getCurrentProfile();
  return {
    canCreateProject: canCreateProject(profile),
    canDeleteProject: canDeleteProject(profile),
  };
}
