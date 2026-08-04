"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MobileNavProvider } from "@/components/portal/MobileNav";
import { PortalMobileNavFallback } from "@/components/portal/PortalMobileNavFallback";
import { Sidebar } from "@/components/portal/Sidebar";
import { SidebarBranding } from "@/components/portal/SidebarBranding";
import { SidebarUserPanel } from "@/components/portal/SidebarUserPanel";
import { SidebarDownloadLink } from "@/components/portal/SidebarDownloadLink";
import { isHostedFullscreenViewerPath, HOSTED_PORTAL_PATHS } from "@/lib/routing/hosted-routes";
import type { NavItem } from "@/lib/portal/navigation";
import type { Profile } from "@/types/database";

type HostedAppShellFrameProps = {
  children: ReactNode;
  navItems: NavItem[];
  profile: Profile;
};

export function HostedAppShellFrame({
  children,
  navItems,
  profile,
}: HostedAppShellFrameProps) {
  const pathname = usePathname();

  if (isHostedFullscreenViewerPath(pathname ?? "")) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell flex h-full min-h-0 overflow-hidden">
      <Sidebar
        navItems={navItems}
        profile={profile}
        profileHref={HOSTED_PORTAL_PATHS.profile}
      />
      <MobileNavProvider
        navItems={navItems}
        userPanel={
          <SidebarUserPanel profile={profile} profileHref={HOSTED_PORTAL_PATHS.profile} />
        }
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
