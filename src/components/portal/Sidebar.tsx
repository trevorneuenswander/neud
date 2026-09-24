import { SidebarBranding } from "@/components/portal/SidebarBranding";
import { SidebarNavigation } from "@/components/portal/SidebarNavigation";
import { SidebarDownloadLinkSection } from "@/components/portal/SidebarDownloadLinkSection";
import { SidebarUserPanel } from "@/components/portal/SidebarUserPanel";
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
  const noDragStyle = { WebkitAppRegion: "no-drag" } as React.CSSProperties;

  return (
    <aside
      className="sidebar hidden h-full w-[var(--sidebar-width,260px)] shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar lg:flex"
      style={noDragStyle}
    >
      <div className="shrink-0 border-b border-border px-4 py-3">
        <SidebarBranding />
      </div>

      <nav
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-2 motion-reduce:overflow-y-visible"
        aria-label="Main"
      >
        <SidebarNavigation
          navItems={navItems}
          initialSidebarProjects={initialSidebarProjects}
          initialViewerMode={initialViewerMode}
        />
      </nav>

      <SidebarDownloadLinkSection />

      <div className="shrink-0 border-t border-border px-3 py-3">
        <SidebarUserPanel profile={profile} profileHref={profileHref} />
      </div>
    </aside>
  );
}
