import { getCurrentProfile } from "@/lib/auth/authorization";
import { resolveProjectCreator, type ProjectCreator } from "@/lib/displays/creator";
import { localGetProjectsMeta } from "@/lib/local/displays-api";
import { shouldUseLocalData } from "@/lib/local/mode";
import { createClient } from "@/lib/supabase/server";

export async function getProjectCreator(): Promise<ProjectCreator> {
  if (shouldUseLocalData()) {
    try {
      const meta = await localGetProjectsMeta();
      return resolveProjectCreator({
        email: meta.authenticatedUserEmail ?? null,
        displayName: meta.authenticatedUserDisplayName ?? null,
      });
    } catch {
      return resolveProjectCreator(null);
    }
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const profile = await getCurrentProfile();

  return resolveProjectCreator({
    email: data.user?.email ?? null,
    displayName: profile?.full_name ?? null,
    fullName: profile?.full_name ?? null,
  });
}
