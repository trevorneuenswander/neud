import { HmgLogo } from "@/components/branding/HmgLogo";
import { SidebarNavItem } from "@/components/portal/SidebarNavItem";
import { SidebarUserPanel } from "@/components/portal/SidebarUserPanel";
import type { NavItem } from "@/lib/portal/navigation";
import type { Profile } from "@/types/database";

type SidebarProps = {
  navItems: NavItem[];
  profile: Profile;
  hasLogo: boolean;
};

export function Sidebar({ navItems, profile, hasLogo }: SidebarProps) {
  return (
    <aside className="hidden w-[260px] shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
      <div className="border-b border-border px-4 py-5">
        <HmgLogo href="/dashboard" hasLogo={hasLogo} />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main">
        {navItems.map((item) => (
          <SidebarNavItem key={item.href} href={item.href} label={item.label} />
        ))}
      </nav>

      <div className="border-t border-border px-3 py-4">
        <SidebarUserPanel profile={profile} />
      </div>
    </aside>
  );
}
