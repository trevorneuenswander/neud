import { getCurrentProfile, isAdmin } from "@/lib/auth/authorization";
import { fetchAccessManagementDirectory } from "@/lib/access-management/directory-client";
import { resolveAccessCapabilities } from "@/lib/access-management/role-model";
import type { NavItem } from "@/lib/portal/navigation";
import { HOSTED_PORTAL_NAV_ITEMS } from "@/lib/portal/hosted-navigation";
import { createClient } from "@/lib/supabase/server";

export async function getFilteredHostedPortalNavItems(): Promise<NavItem[]> {
  const platformAdmin = await isAdmin();
  let canManageUsersAndAccess = platformAdmin;

  if (!canManageUsersAndAccess) {
    try {
      const profile = await getCurrentProfile();
      if (profile) {
        const supabase = await createClient();
        const directory = await fetchAccessManagementDirectory(supabase);
        const capabilities = resolveAccessCapabilities(directory, profile.id);
        canManageUsersAndAccess =
          capabilities.hasSiteWideAccess || capabilities.managedTeamIds.length > 0;
      }
    } catch {
      canManageUsersAndAccess = false;
    }
  }

  return HOSTED_PORTAL_NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !canManageUsersAndAccess) {
      return false;
    }
    return true;
  });
}
