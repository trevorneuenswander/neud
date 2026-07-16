"use client";

import { usePathname } from "next/navigation";
import { HmgLogo } from "@/components/branding/HmgLogo";
import { MobileSidebar } from "@/components/portal/MobileSidebar";
import { SidebarUserPanel } from "@/components/portal/SidebarUserPanel";
import { getPageTitle, type NavItem } from "@/lib/portal/navigation";
import type { Profile } from "@/types/database";

type TopBarProps = {
  navItems: NavItem[];
  profile: Profile;
  hasLogo: boolean;
};

export function TopBar({ navItems, profile, hasLogo }: TopBarProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <MobileSidebar
          navItems={navItems}
          userPanel={<SidebarUserPanel profile={profile} />}
          branding={<HmgLogo href="/dashboard" hasLogo={hasLogo} />}
        />
        <div className="min-w-0 lg:hidden">
          <p className="truncate text-xs font-medium text-muted">
            HMG Graphics Server
          </p>
          <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">
            {title}
          </h1>
        </div>
        <div className="hidden min-w-0 lg:block">
          <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">
            {title}
          </h1>
        </div>
      </div>

      <div className="hidden items-center gap-3 md:flex">
        <div
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-muted"
          aria-disabled="true"
          title="Command palette coming later"
        >
          Search or jump to… <span className="text-muted/80">Ctrl K</span>
        </div>
      </div>
    </header>
  );
}
