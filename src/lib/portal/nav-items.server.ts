import { shouldUseLocalData } from "@/lib/local/mode";
import { localGetProjectsMeta } from "@/lib/local/displays-api";
import { isAdmin } from "@/lib/auth/authorization";
import { PORTAL_NAV_ITEMS, type NavItem } from "@/lib/portal/navigation";

export async function getFilteredPortalNavItems(): Promise<NavItem[]> {
  if (shouldUseLocalData()) {
    const meta = await localGetProjectsMeta({ wait: false });
    return PORTAL_NAV_ITEMS.filter((item) => {
      if (item.adminOnly && !meta.canManageUsersAndAccess) {
        return false;
      }
      return true;
    });
  }

  const showAdminNav = await isAdmin();
  return PORTAL_NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !showAdminNav) {
      return false;
    }
    return true;
  });
}
