import { getCurrentProfile } from "@/lib/auth/authorization";
import {
  canCreateProject,
  canDeleteProject,
} from "@/lib/auth/platform-permissions";
import { localGetProjectsMeta } from "@/lib/local/displays-api";
import { shouldUseLocalData } from "@/lib/local/mode";
import { createClient } from "@/lib/supabase/server";

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
  let teamAdminCreate = false;
  if (!canCreateProject(profile)) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.rpc("user_is_any_team_admin");
      teamAdminCreate = data === true;
    } catch {
      teamAdminCreate = false;
    }
  }
  return {
    canCreateProject: canCreateProject(profile) || teamAdminCreate,
    canDeleteProject: canDeleteProject(profile),
  };
}
