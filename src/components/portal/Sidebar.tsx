import { SidebarBranding } from "@/components/portal/SidebarBranding";
import { SidebarNavItem } from "@/components/portal/SidebarNavItem";
import { SidebarDownloadLink } from "@/components/portal/SidebarDownloadLink";
import { SidebarUserPanel } from "@/components/portal/SidebarUserPanel";
import type { NavItem } from "@/lib/portal/navigation";
import type { Profile } from "@/types/database";

type SidebarProps = {
  navItems: NavItem[];
  profile: Profile;
  profileHref?: string;
};

export function Sidebar({ navItems, profile, profileHref }: SidebarProps) {
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
        {navItems.map((item) => (
          <SidebarNavItem
            key={item.href}
            href={item.href}
            label={item.label}
            activeMatch={item.activeMatch}
          />
        ))}
      </nav>

      <div className="shrink-0 px-3 pb-2">
        <SidebarDownloadLink />
      </div>

      <div className="shrink-0 border-t border-border px-3 py-3">
        <SidebarUserPanel profile={profile} profileHref={profileHref} />
      </div>
    </aside>
  );
}
