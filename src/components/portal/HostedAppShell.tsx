import { HostedAppShellFrame } from "@/components/portal/HostedAppShellFrame";
import { requireUser } from "@/lib/auth/authorization";
import { getFilteredHostedPortalNavItems } from "@/lib/portal/hosted-nav-items.server";

type HostedAppShellProps = {
  children: React.ReactNode;
};

export async function HostedAppShell({ children }: HostedAppShellProps) {
  const { profile } = await requireUser();
  const navItems = await getFilteredHostedPortalNavItems();

  return (
    <HostedAppShellFrame navItems={navItems} profile={profile}>
      {children}
    </HostedAppShellFrame>
  );
}
