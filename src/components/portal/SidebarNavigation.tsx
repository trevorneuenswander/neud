"use client";

import { SidebarNavItem } from "@/components/portal/SidebarNavItem";
import { SidebarProjectsNav } from "@/components/portal/SidebarProjectsNav";
import type { NavItem } from "@/lib/portal/navigation";
import type { ProjectListItem } from "@/lib/projects/types";

type SidebarNavigationProps = {
  navItems: NavItem[];
  initialSidebarProjects?: ProjectListItem[];
  initialViewerMode?: boolean;
  onNavigate?: () => void;
};

export function SidebarNavigation({
  navItems,
  initialSidebarProjects,
  initialViewerMode,
  onNavigate,
}: SidebarNavigationProps) {
  return (
    <>
      {navItems.map((item) =>
        item.href === "/projects" ? (
          <SidebarProjectsNav
            key={item.href}
            initialProjects={initialSidebarProjects}
            initialViewerMode={initialViewerMode}
            onNavigate={onNavigate}
          />
        ) : (
          <SidebarNavItem
            key={item.href}
            href={item.href}
            label={item.label}
            activeMatch={item.activeMatch}
            onNavigate={onNavigate}
          />
        ),
      )}
    </>
  );
}
