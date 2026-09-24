import { MobileNavProvider } from "@/components/portal/MobileNav";
import { PortalMobileNavFallback } from "@/components/portal/PortalMobileNavFallback";
import { Sidebar } from "@/components/portal/Sidebar";
import { SidebarBranding } from "@/components/portal/SidebarBranding";
import { SidebarUserPanel } from "@/components/portal/SidebarUserPanel";
import { requireUser } from "@/lib/auth/authorization";
import { shouldUseLocalData } from "@/lib/local/mode";
import { getFilteredPortalNavItems } from "@/lib/portal/nav-items.server";
import { getVisibleProjects } from "@/lib/projects/queries";

type AppShellProps = {
  children: React.ReactNode;
};

export async function AppShell({ children }: AppShellProps) {
  const { profile } = await requireUser();
  const navItems = await getFilteredPortalNavItems();
  const isLocalMode = shouldUseLocalData();
  const initialSidebarProjects = isLocalMode ? undefined : await getVisibleProjects();

  return (
    <div className="app-shell flex h-full min-h-0 overflow-hidden">
      <Sidebar
        navItems={navItems}
        profile={profile}
        initialSidebarProjects={initialSidebarProjects}
      />
      <MobileNavProvider
        navItems={navItems}
        initialSidebarProjects={initialSidebarProjects}
        userPanel={<SidebarUserPanel profile={profile} />}
        branding={<SidebarBranding />}
      >
        <main className="main-content flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <PortalMobileNavFallback />
          <div className="portal-scroll-region flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 py-6 lg:px-6">
            {children}
          </div>
        </main>
      </MobileNavProvider>
    </div>
  );
}
