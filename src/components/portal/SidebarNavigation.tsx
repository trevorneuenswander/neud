"use client";

import { SidebarNavItem } from "@/components/portal/SidebarNavItem";
import { SidebarProjectsNav } from "@/components/portal/SidebarProjectsNav";
import type { NavItem } from "@/lib/portal/navigation";
import { isProjectsNavHref } from "@/lib/projects/project-landing-route";
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
        isProjectsNavHref(item.href) ? (
          <SidebarProjectsNav
            key={item.href}
            projectsHref={item.href}
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
