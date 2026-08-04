import { isAdmin } from "@/lib/auth/authorization";
import type { NavItem } from "@/lib/portal/navigation";
import { HOSTED_PORTAL_NAV_ITEMS } from "@/lib/portal/hosted-navigation";

export async function getFilteredHostedPortalNavItems(): Promise<NavItem[]> {
  const showAdminNav = await isAdmin();
  return HOSTED_PORTAL_NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !showAdminNav) {
      return false;
    }
    return true;
  });
}
