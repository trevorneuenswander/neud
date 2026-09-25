"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarTooltip } from "@/components/portal/SidebarTooltip";
import { resolveHostedNavActiveState } from "@/lib/portal/hosted-navigation";
import { useSidebarCollapsed } from "@/lib/portal/sidebar-collapse-context";
import { resolveSidebarNavIcon } from "@/lib/portal/sidebar-nav-icons";
import {
  sidebarPrimaryNavActiveClass,
  sidebarPrimaryNavInactiveClass,
  sidebarPrimaryNavRowClass,
} from "@/lib/portal/sidebar-nav-item-classes";

type SidebarNavItemProps = {
  href: string;
  label: string;
  activeMatch?: "exact" | "prefix";
  onNavigate?: () => void;
};

function resolveNavActiveState(
  pathname: string,
  href: string,
  activeMatch?: "exact" | "prefix",
): boolean {
  if (href.startsWith("/portal")) {
    return resolveHostedNavActiveState(pathname, href);
  }

  const normalizedPath = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  const mode = activeMatch ?? (href === "/dashboard" ? "exact" : "prefix");

  if (mode === "exact") {
    return normalizedPath === href;
  }

  return normalizedPath === href || normalizedPath.startsWith(`${href}/`);
}

export function SidebarNavItem({
  href,
  label,
  activeMatch,
  onNavigate,
}: SidebarNavItemProps) {
  const pathname = usePathname();
  const collapsed = useSidebarCollapsed();
  const isActive = resolveNavActiveState(pathname, href, activeMatch);
  const Icon = resolveSidebarNavIcon(label);

  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      className={`${sidebarPrimaryNavRowClass(collapsed)} ${
        isActive ? sidebarPrimaryNavActiveClass : sidebarPrimaryNavInactiveClass
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className={collapsed ? "sr-only" : "min-w-0 truncate"}>{label}</span>
    </Link>
  );

  if (!collapsed) {
    return link;
  }

  return (
    <SidebarTooltip label={label}>
      {link}
    </SidebarTooltip>
  );
}
