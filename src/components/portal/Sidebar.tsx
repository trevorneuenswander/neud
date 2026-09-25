"use client";

import { useState } from "react";
import { SidebarBranding } from "@/components/portal/SidebarBranding";
import { SidebarNavigation } from "@/components/portal/SidebarNavigation";
import { SidebarDownloadLinkSection } from "@/components/portal/SidebarDownloadLinkSection";
import { SidebarUserPanel } from "@/components/portal/SidebarUserPanel";
import { SidebarCollapseProvider } from "@/lib/portal/sidebar-collapse-context";
import {
  SIDEBAR_WIDTH_TRANSITION_CLASS,
  sidebarWidthPx,
} from "@/lib/portal/sidebar-layout";
import type { NavItem } from "@/lib/portal/navigation";
import type { ProjectListItem } from "@/lib/projects/types";
import type { Profile } from "@/types/database";

type SidebarProps = {
  navItems: NavItem[];
  profile: Profile;
  profileHref?: string;
  initialSidebarProjects?: ProjectListItem[];
  initialViewerMode?: boolean;
};

export function Sidebar({
  navItems,
  profile,
  profileHref,
  initialSidebarProjects,
  initialViewerMode,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const noDragStyle = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

  function toggleSidebar() {
    setCollapsed((current) => !current);
  }

  return (
    <SidebarCollapseProvider collapsed={collapsed}>
      <aside
        className={`sidebar hidden h-full shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar lg:flex ${SIDEBAR_WIDTH_TRANSITION_CLASS}`}
        style={{ ...noDragStyle, width: sidebarWidthPx(collapsed) }}
        data-sidebar-collapsed={collapsed ? "true" : "false"}
      >
        <div className="shrink-0 border-b border-border px-2 py-2">
          <SidebarBranding onToggleSidebar={toggleSidebar} />
        </div>

        <nav
          className={`min-h-0 flex-1 space-y-0.5 overflow-y-auto py-2 motion-reduce:overflow-y-visible ${
            collapsed ? "px-2" : "px-3"
          }`}
          aria-label="Main"
        >
          <SidebarNavigation
            navItems={navItems}
            initialSidebarProjects={initialSidebarProjects}
            initialViewerMode={initialViewerMode}
          />
        </nav>

        <SidebarDownloadLinkSection />

        <div
          className={`shrink-0 border-t border-border py-3 ${collapsed ? "px-2" : "px-3"}`}
        >
          <SidebarUserPanel profile={profile} profileHref={profileHref} />
        </div>
      </aside>
    </SidebarCollapseProvider>
  );
}
