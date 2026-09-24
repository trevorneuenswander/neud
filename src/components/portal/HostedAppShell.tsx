import { HostedAppShellFrame } from "@/components/portal/HostedAppShellFrame";
import { requireUser } from "@/lib/auth/authorization";
import { getHostedAccessibleProjects } from "@/lib/hosted/portal-queries";
import { getFilteredHostedPortalNavItems } from "@/lib/portal/hosted-nav-items.server";
import type { ProjectListItem } from "@/lib/projects/types";

type HostedAppShellProps = {
  children: React.ReactNode;
};

export async function HostedAppShell({ children }: HostedAppShellProps) {
  const { profile } = await requireUser();
  const [navItems, hostedProjects] = await Promise.all([
    getFilteredHostedPortalNavItems(),
    getHostedAccessibleProjects(),
  ]);
  const initialSidebarProjects = hostedProjects as unknown as ProjectListItem[];

  return (
    <HostedAppShellFrame
      navItems={navItems}
      profile={profile}
      initialSidebarProjects={initialSidebarProjects}
    >
      {children}
    </HostedAppShellFrame>
  );
}
